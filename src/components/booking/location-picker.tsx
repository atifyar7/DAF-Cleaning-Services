"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Marker } from "leaflet";
import { useEffect, useRef, useState } from "react";
import { isInDubai } from "@/lib/booking/input";
import type { SiteContent } from "@/content/en";
import { Icon } from "../icon";

type Props = {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number | null, longitude: number | null) => void;
  labels: SiteContent["booking"]["details"];
};

const DUBAI_CENTRE: [number, number] = [25.2048, 55.2708];
const round = (value: number) => Math.round(value * 1e6) / 1e6;

export function LocationPicker({ latitude, longitude, onChange, labels }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const leaflet = useRef<typeof import("leaflet") | null>(null);
  const changeRef = useRef(onChange);
  const placeRef = useRef<(lat: number, lng: number, fly: boolean) => void>(() => {});
  const [message, setMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const [ready, setReady] = useState(false);

  // The map is created once, so it reaches the latest handlers through refs.
  useEffect(() => {
    changeRef.current = onChange;
    placeRef.current = place;
  });

  // Leaflet needs the browser, so it loads after the page renders.
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !container.current || map.current) return;
      leaflet.current = L;
      map.current = L.map(container.current, { center: DUBAI_CENTRE, zoom: 11, scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map.current);
      map.current.on("click", (event) => placeRef.current(event.latlng.lat, event.latlng.lng, false));
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
  }, []);

  // Keeps the marker in step with the chosen location.
  useEffect(() => {
    const L = leaflet.current;
    if (!ready || !L || !map.current) return;
    if (latitude === null || longitude === null) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    const icon = L.divIcon({ className: "map-pin", html: "<span></span>", iconSize: [28, 28], iconAnchor: [14, 28] });
    if (marker.current) marker.current.setLatLng([latitude, longitude]);
    else marker.current = L.marker([latitude, longitude], { icon }).addTo(map.current);
  }, [ready, latitude, longitude]);

  function place(lat: number, lng: number, fly: boolean) {
    if (!isInDubai(lat, lng)) {
      setMessage(labels.outside);
      return;
    }
    setMessage("");
    changeRef.current(round(lat), round(lng));
    if (fly) map.current?.flyTo([lat, lng], 16);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage(labels.denied);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        place(position.coords.latitude, position.coords.longitude, true);
      },
      () => {
        setLocating(false);
        setMessage(labels.denied);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const pinned = latitude !== null && longitude !== null;

  return (
    <div className="sm:col-span-2">
      <p className="text-sm font-medium">{labels.map}</p>
      <p className="mt-1 text-sm text-muted">{labels.mapHint}</p>
      <div
        ref={container}
        dir="ltr"
        role="application"
        aria-label={labels.map}
        className="relative z-0 mt-3 h-72 overflow-hidden rounded-xl border border-border"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={locating}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 font-medium text-accent transition hover:border-accent disabled:opacity-60"
        >
          <Icon name="pin" className="h-4 w-4" />
          {locating ? labels.locating : labels.useLocation}
        </button>
        {pinned && (
          <>
            <span className="inline-flex items-center gap-1.5 text-accent">
              <Icon name="check" className="h-4 w-4" />
              {labels.pinned}
            </span>
            <button type="button" onClick={() => changeRef.current(null, null)} className="text-muted underline hover:text-foreground">
              {labels.removePin}
            </button>
          </>
        )}
      </div>
      {message && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {message}
        </p>
      )}
    </div>
  );
}
