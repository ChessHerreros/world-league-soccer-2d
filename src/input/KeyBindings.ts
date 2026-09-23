export interface KeyBindings {
  up: string;
  down: string;
  left: string;
  right: string;
  kick: string;
  sprint: string;
  dribbleLeft: string;
  dribbleRight: string;
  dash: string;
}

export const DEFAULT_KEYBINDINGS: KeyBindings = {
  up: "w",
  down: "s",
  left: "a",
  right: "d",
  kick: " ",
  sprint: "shift",
  dribbleLeft: "q",
  dribbleRight: "e",
  dash: "c",
};

export const ACTION_DETAILS: Record<keyof KeyBindings, { label: string; desc: string; icon: string }> = {
  up: { label: "Mover Arriba", desc: "Avanzar hacia arriba", icon: "⬆️" },
  down: { label: "Mover Abajo", desc: "Retroceder hacia abajo", icon: "⬇️" },
  left: { label: "Mover Izquierda", desc: "Desplazarse a la izquierda", icon: "⬅️" },
  right: { label: "Mover Derecha", desc: "Desplazarse a la derecha", icon: "➡️" },
  kick: { label: "Chutar / Cargar", desc: "Patear o mantener pulsado para potencia", icon: "⚽" },
  sprint: { label: "Sprint / Acelerar", desc: "Consume estamina para correr", icon: "⚡" },
  dribbleLeft: { label: "Regate Izquierda", desc: "Arrastre rápido hacia la izquierda", icon: "↩️" },
  dribbleRight: { label: "Regate Derecha", desc: "Arrastre rápido hacia la derecha", icon: "↪️" },
  dash: { label: "Dash / Impulso", desc: "Impulso instantáneo en dirección", icon: "💨" },
};

const STORAGE_KEY = "wls_keybindings";

export function loadKeyBindings(): KeyBindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_KEYBINDINGS,
        ...parsed,
      };
    }
  } catch {
    // Fallback on parse failure
  }
  return { ...DEFAULT_KEYBINDINGS };
}

export function saveKeyBindings(bindings: KeyBindings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    // Storage fallback
  }
}

export function formatKeyDisplay(key: string): string {
  if (!key) return "---";
  const k = key.toLowerCase();
  if (k === " ") return "ESPACIO";
  if (k === "shift") return "SHIFT";
  if (k === "control") return "CTRL";
  if (k === "alt") return "ALT";
  if (k === "enter") return "ENTER";
  if (k === "tab") return "TAB";
  if (k === "capslock") return "BLOQ MAYÚS";
  if (k === "arrowup") return "↑ ARRIBA";
  if (k === "arrowdown") return "↓ ABAJO";
  if (k === "arrowleft") return "← IZQ";
  if (k === "arrowright") return "→ DER";
  if (k === "backspace") return "BORRAR";
  if (k === "delete") return "SUPR";
  return key.toUpperCase();
}
