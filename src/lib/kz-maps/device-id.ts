const STORAGE_KEY = "qhub_kz_maps_device_id";

export function getKzMapsDeviceId(): string {
  if (typeof localStorage === "undefined") return "web-anonymous";
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
