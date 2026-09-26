"use client";

import { useState, useTransition } from "react";
import { leerGoogleSheets } from "@/lib/acciones-plantillas";
import { PLANTILLA_EXCEL, excelEnLinea, sheetsCopia } from "@/lib/plantillas";

// Plantilla de departamentos en Excel o Google Sheets, y lectura de una hoja de Google por su enlace (RN-27).
// onTexto recibe la tabla separada por tabulaciones, igual que al pegar desde Excel.
export function FuentesPlantilla({ onTexto }: { onTexto: (texto: string, origen: string) => void }) {
  const [enlace, setEnlace] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  return (
    <div className="mb-3 rounded-xl border border-line bg-surface2 p-3 text-sm">
      <p className="mb-2 font-semibold">1. Llena la plantilla</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <a className="btn quiet sm" href={PLANTILLA_EXCEL} download>
          Descargar Excel
        </a>
        <a className="btn quiet sm" href={excelEnLinea()} target="_blank" rel="noreferrer">
          Abrir en Excel en línea
        </a>
        <a className="btn quiet sm" href={sheetsCopia()} target="_blank" rel="noreferrer">
          Copiar en Google Sheets
        </a>
      </div>
      <p className="mb-2 font-semibold">2. Tráela a EDIFIKA</p>
      <p className="mb-2 text-muted">
        Sube el Excel, pega la tabla más abajo o, si usas Google Sheets, compártela como &quot;Cualquier persona con el enlace&quot; y pega su
        enlace:
      </p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          iniciar(async () => {
            const r = await leerGoogleSheets(enlace);
            if ("error" in r) setError(r.error);
            else {
              onTexto(r.texto, "Google Sheets");
              setEnlace("");
            }
          });
        }}
      >
        <input
          type="url"
          value={enlace}
          onChange={(e) => setEnlace(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/…"
          aria-label="Enlace de Google Sheets"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5"
        />
        <button className="btn quiet sm" disabled={pendiente || !enlace.trim()}>
          {pendiente ? "Leyendo…" : "Traer desde Google Sheets"}
        </button>
      </form>
      {error && <p className="mt-2 text-bad">{error}</p>}
    </div>
  );
}
