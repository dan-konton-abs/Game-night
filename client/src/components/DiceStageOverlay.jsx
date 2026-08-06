import React, { useEffect, useRef, useState } from "react";
import { createDiceStage } from "../dice3d.js";
import { diceFromEntry } from "../diceShapes.js";

const HOLD_MS = 1500;

/**
 * A transient 3D dice roll, shown over the map for everyone in the room -
 * not just whoever has the Dice tab open. The 2D tray in DicePanel remains
 * the source of truth for results/pushes; this is purely a shared spectacle
 * layered on top, so failures here (no WebGL, a broken driver) should never
 * block anything - just quietly do nothing.
 */
export default function DiceStageOverlay({ room, quality }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const hideTimerRef = useRef(null);
  const lastSeenIdRef = useRef(room.diceLog[0]?.id ?? null);
  const [visible, setVisible] = useState(false);

  const style = room.theme === "scifi" ? "terminal" : "felt";

  useEffect(() => {
    if (quality === "off" || !canvasRef.current) return;
    try {
      stageRef.current = createDiceStage(canvasRef.current, {
        style,
        quality,
        onSettled: () => {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = setTimeout(() => setVisible(false), HOLD_MS);
        },
      });
    } catch (err) {
      // No WebGL, a driver crash, whatever - the 2D tray already shows the
      // real result, so this feature just silently isn't available here.
      console.warn("3D dice unavailable:", err.message);
      stageRef.current = null;
    }
    return () => {
      clearTimeout(hideTimerRef.current);
      stageRef.current?.dispose();
      stageRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality, style]);

  useEffect(() => {
    if (!containerRef.current || !stageRef.current) return;
    const ro = new ResizeObserver(() => stageRef.current?.resize());
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [quality, style]);

  useEffect(() => {
    const newest = room.diceLog[0];
    if (!newest || newest.id === lastSeenIdRef.current) return;
    lastSeenIdRef.current = newest.id;
    if (!stageRef.current) return;

    const specs = diceFromEntry(newest).map((d) => ({
      sides: d.sides,
      value: d.value,
      variant: d.variant === "stress" ? "stress" : "normal",
    }));
    clearTimeout(hideTimerRef.current);
    setVisible(true);
    stageRef.current.resize();
    stageRef.current.roll(specs);
  }, [room.diceLog]);

  if (quality === "off") return null;

  return (
    <div
      ref={containerRef}
      className={`dice-stage-overlay ${visible ? "dice-stage-visible" : ""}`}
      onClick={() => setVisible(false)}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
