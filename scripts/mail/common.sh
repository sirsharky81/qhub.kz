#!/bin/bash
# Shared paths and helpers for QHub mail management scripts.
set -euo pipefail

MAIL_DOMAIN="${MAIL_DOMAIN:-qhub.kz}"
MAIL_VHOSTS="${MAIL_VHOSTS:-/var/mail/vhosts/${MAIL_DOMAIN}}"
DOVECOT_USERS="${DOVECOT_USERS:-/etc/dovecot/users}"
POSTFIX_VIRTUAL="${POSTFIX_VIRTUAL:-/etc/postfix/virtual_mailboxes}"
POSTFIX_DOMAINS="${POSTFIX_DOMAINS:-/etc/postfix/virtual_mailbox_domains}"
VMUID="${MAIL_VMUID:-5000}"
VMGID="${MAIL_VMGID:-5000}"
MAIL_DEFAULT_QUOTA="${MAIL_DEFAULT_QUOTA:-1G}"
MAIL_VPS_IP="${MAIL_VPS_IP:-65.108.215.248}"

mail_local_part() {
  local email="$1"
  email="${email,,}"
  if [[ "$email" != *@* ]]; then
    echo "Invalid email: $email" >&2
    return 1
  fi
  local local="${email%%@*}"
  local domain="${email#*@}"
  if [[ "$domain" != "$MAIL_DOMAIN" ]]; then
    echo "Email must be @${MAIL_DOMAIN}: $email" >&2
    return 1
  fi
  if [[ ! "$local" =~ ^[a-z0-9][a-z0-9._+-]{0,63}$ ]]; then
    echo "Invalid local part: $local" >&2
    return 1
  fi
  printf '%s' "$local"
}

mail_home_dir() {
  local local
  local="$(mail_local_part "$1")"
  printf '%s/%s/' "$MAIL_VHOSTS" "$local"
}

mail_postfix_entry() {
  local email="${1,,}"
  local local
  local="$(mail_local_part "$email")"
  printf '%s\t%s/%s/' "$email" "$MAIL_DOMAIN" "$local"
}

mail_hash_password() {
  doveadm pw -s SHA512-CRYPT -p "$1" | tr -d '\r'
}

mail_reload_services() {
  postmap "$POSTFIX_VIRTUAL"
  postmap "$POSTFIX_DOMAINS"
  systemctl reload postfix
  systemctl reload dovecot
}

mail_ensure_runtime() {
  id -u vmail >/dev/null 2>&1 || useradd -r -u "$VMUID" -g mail -d "$MAIL_VHOSTS" -s /usr/sbin/nologin vmail
  install -d -m 0750 -o vmail -g mail "$MAIL_VHOSTS"
  touch "$DOVECOT_USERS"
  chmod 640 "$DOVECOT_USERS"
  chown root:dovecot "$DOVECOT_USERS"
  touch "$POSTFIX_VIRTUAL" "$POSTFIX_DOMAINS"
}

mail_user_line() {
  local email="$1"
  local hash="$2"
  local quota="${3:-$MAIL_DEFAULT_QUOTA}"
  local home
  home="$(mail_home_dir "$email")"
  printf '%s:%s:%s:%s::%s:quota_rule=*:storage=%s\n' "$email" "$hash" "$VMUID" "$VMGID" "$home" "$quota"
}

mail_parse_user_fields() {
  local email="${1,,}"
  local line
  line="$(grep -i "^${email}:" "$DOVECOT_USERS" | head -n1 || true)"
  if [ -z "$line" ]; then
    return 1
  fi
  HOME_DIR="$(printf '%s' "$line" | awk -F: '{print $6}')"
  EXTRA="$(printf '%s' "$line" | awk -F: '{print $7}')"
  if [[ "$EXTRA" =~ storage=([^[:space:]]+) ]]; then
    QUOTA="${BASH_REMATCH[1]}"
  else
    QUOTA="$MAIL_DEFAULT_QUOTA"
  fi
}

mail_replace_user() {
  local email="${1,,}"
  local line="$2"
  local tmp
  tmp="$(mktemp)"
  if [ -f "$DOVECOT_USERS" ]; then
    grep -vi "^${email}:" "$DOVECOT_USERS" >"$tmp" || true
  fi
  printf '%s\n' "$line" >>"$tmp"
  mv "$tmp" "$DOVECOT_USERS"
  chmod 640 "$DOVECOT_USERS"
  chown root:dovecot "$DOVECOT_USERS"
}

mail_replace_postfix_entry() {
  local email="${1,,}"
  local entry="$2"
  local tmp
  tmp="$(mktemp)"
  if [ -f "$POSTFIX_VIRTUAL" ]; then
    grep -vi "^${email}[[:space:]]" "$POSTFIX_VIRTUAL" >"$tmp" || true
  fi
  printf '%s\n' "$entry" >>"$tmp"
  mv "$tmp" "$POSTFIX_VIRTUAL"
}

mail_verify_password() {
  local email="$1"
  local password="$2"
  doveadm auth test "$email" "$password" >/dev/null 2>&1
}
