export type VpnPeerStatus = "active" | "revoked";

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

export interface VpnPeerPublic {
  id: string;
  label: string;
  address: string;
  createdAt: number;
  status: VpnPeerStatus;
}

export interface VpnAccessCheckResult {
  allowed: boolean;
  vpnEnabled: boolean;
  messengerLoggedIn: boolean;
  phone?: string;
}
