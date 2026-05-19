"use client";
import { useEffect, useRef, useState } from "react";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";

export function VisualiserOverlay({ onClose }) {
  const [step, setStep] = useState("init"); // "init" | "picker" | "live" | "error"
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState(null);
  const [stream, setStream] = useState(null);
  const videoRef = useRef(null);

  // On mount: request permission once to unlock device labels, then enumerate.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error("This browser doesn't support camera access.");
        }
        const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        tmp.getTracks().forEach(t => t.stop());
        if (cancelled) return;
        const all = await navigator.mediaDevices.enumerateDevices();
        const cams = all.filter(d => d.kind === "videoinput");
        if (cancelled) return;
        if (cams.length === 0) {
          setError("No cameras detected on this computer.");
          setStep("error");
          return;
        }
        setDevices(cams);
        setStep("picker");
      } catch (e) {
        if (cancelled) return;
        const name = e?.name || "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setError("Camera permission denied. Allow camera access for this site in your browser settings, then try again.");
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setError("No camera detected on this computer.");
        } else if (name === "NotReadableError" || name === "TrackStartError") {
          setError("Camera is in use by another application. Close anything else using the camera and try again.");
        } else {
          setError(`Couldn't access camera: ${e?.message || name || "unknown error"}`);
        }
        setStep("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Attach stream to <video> when it becomes available; stop tracks on change/unmount.
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [stream]);

  // ESC closes.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selectCamera = async (deviceId) => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: false,
      });
      setStream(s);
      setStep("live");
    } catch (e) {
      setError(`Couldn't start that camera: ${e?.message || e?.name || "unknown error"}`);
      setStep("error");
    }
  };

  const changeCamera = () => {
    setStream(null); // cleanup effect stops tracks
    setStep("picker");
  };

  const labelFor = (d, i) => d.label?.trim() || `Camera ${i + 1}`;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 500, display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", padding: "12px 20px", background: "rgba(0,0,0,0.85)", borderBottom: "1px solid rgba(255,255,255,0.08)", gap: 12, flexShrink: 0 }}>
        <button onClick={onClose} title="Close (Esc)" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#fff", lineHeight: 1, padding: 4 }}>←</button>
        <div style={{ flex: 1, color: "#fff", fontFamily: C.mono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.85 }}>
          {step === "init" && "Visualiser · requesting camera…"}
          {step === "picker" && "Visualiser · choose camera"}
          {step === "live" && "Visualiser · live"}
          {step === "error" && "Visualiser · error"}
        </div>
        {step === "live" && (
          <button
            onClick={changeCamera}
            style={{
              background: "transparent",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.25)",
              padding: "7px 14px",
              borderRadius: 4,
              fontFamily: C.mono,
              fontSize: 11,
              cursor: "pointer",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Change camera
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
        {step === "init" && (
          <div style={{ color: "rgba(255,255,255,0.6)", fontFamily: C.mono, fontSize: 12, letterSpacing: "0.06em" }}>
            Waiting for camera permission…
          </div>
        )}

        {step === "picker" && (
          <div style={{ background: C.surface, padding: 28, borderRadius: 8, maxWidth: 480, width: "90%", maxHeight: "80%", overflowY: "auto", border: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: C.serif, fontSize: 24, lineHeight: 1.1, marginBottom: 6, color: C.text }}>Choose a camera</div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: C.mono, letterSpacing: "0.04em", marginBottom: 18 }}>
              {devices.length} CAMERA{devices.length === 1 ? "" : "S"} DETECTED
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {devices.map((d, i) => (
                <button
                  key={d.deviceId || i}
                  onClick={() => selectCamera(d.deviceId)}
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    background: C.bg,
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    cursor: "pointer",
                    fontFamily: C.sans,
                    fontSize: 14,
                    color: C.text,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span style={{ fontSize: 18 }}>📷</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{labelFor(d, i)}</div>
                    {d.deviceId && (
                      <div style={{ fontSize: 10, color: C.dim, fontFamily: C.mono, marginTop: 2 }}>
                        {d.deviceId.slice(0, 24)}{d.deviceId.length > 24 ? "…" : ""}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end" }}>
              <Btn v="ghost" onClick={onClose}>Cancel</Btn>
            </div>
          </div>
        )}

        {step === "error" && (
          <div style={{ background: C.surface, padding: 28, borderRadius: 8, maxWidth: 480, width: "90%", border: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: C.serif, fontSize: 22, lineHeight: 1.15, marginBottom: 10, color: C.text }}>Can't open the visualiser</div>
            <div style={{ fontSize: 14, color: C.muted, marginBottom: 20, lineHeight: 1.5 }}>{error}</div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Btn onClick={onClose}>Close</Btn>
            </div>
          </div>
        )}

        {step === "live" && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              background: "#000",
            }}
          />
        )}
      </div>

      {/* Footer hint */}
      {step === "live" && (
        <div style={{ padding: "8px 20px", background: "rgba(0,0,0,0.85)", borderTop: "1px solid rgba(255,255,255,0.08)", fontFamily: C.mono, fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: "0.1em", textAlign: "center", textTransform: "uppercase", flexShrink: 0 }}>
          Esc to close
        </div>
      )}
    </div>
  );
}
