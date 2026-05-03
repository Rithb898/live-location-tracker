const socket = io();
const map = L.map("map").setView([51.505, -0.09], 13);

const remoteMarkers = new Map();

socket.on("server:client:disconnect", (data) => {
  const { id } = data;
  if (remoteMarkers.has(id)) {
    map.removeLayer(remoteMarkers.get(id));
    remoteMarkers.delete(id);
  }
});

socket.on("server:location:update", (data) => {
  const { id, latitude, longitude } = data;
  if (id === socket.id) return; // Ignore own updates
  if (!remoteMarkers.has(id)) {
    const marker = L.marker([latitude, longitude]);
    marker.addTo(map).bindPopup(id);
    remoteMarkers.set(id, marker);
  } else {
    const existingMarker = remoteMarkers.get(id);
    existingMarker.setLatLng([latitude, longitude]);
  }
});

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

function getUsersCurrentLocation() {
  return new Promise((res, rej) => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log(`Got user's location`, position);
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;
          res({ latitude, longitude });
        },
        (err) => {
          rej(err);
        },
        { enableHighAccuracy: true },
      );
    } else {
      alert("Geolocation is not available in this browser");
      rej(new Error("Geolocation not available"));
    }
  });
}

let myCurrentLocationMarker = null;

async function updateLocation() {
  try {
    const { latitude, longitude } = await getUsersCurrentLocation();
    socket.emit("client:location:update", { latitude, longitude });
    if (!myCurrentLocationMarker) {
      myCurrentLocationMarker = L.marker([latitude, longitude])
        .addTo(map)
        .bindPopup("You are here");
      map.setView([latitude, longitude], 15);
    } else {
      myCurrentLocationMarker.setLatLng([latitude, longitude]);
      map.setView([latitude, longitude]);
    }
  } catch (err) {
    console.error(err);
  }
}

async function main() {
  await updateLocation();
  setInterval(updateLocation, 1 * 1000);
}

window.addEventListener("load", main);
