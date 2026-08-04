export type VpnPeerStatus = "active" | "revoked";
export type VpnProtocol = "wireguard" | "amnezia";

export interface VpnPeer {
  id: string;
  phone: string;
  label: string;
  publicKey: string;
  privateKey: string;
  address: string;
  createdAt: number;
  status: VpnPeerStatus;
  revokedAt?: number;
}

export interface AmneziaPeer {
  id: string;
  phone: string;
  label: string;
  /** Client name on awg0 (manage_amneziawg.sh) */
  amneziaName: string;
  address: string;
  createdAt: number;
  status: VpnPeerStatus;
  revokedAt?: number;
}

export interface VpnPeerPublic {
  id: string;
  label: string;
  protocol: VpnProtocol;
  address: string;
  createdAt: number;
  status: VpnPeerStatus;
}

export interface VpnAccessCheckResult {
  allowed: boolean;
  vpnEnabled: boolean;
  messengerLoggedIn: boolean;
  phone?: string;
  configured: boolean;
  wireguardConfigured: boolean;
  amneziaConfigured: boolean;
}
