"use client";

import { useEffect, useState, useTransition } from "react";
import { enviarRecibo, registrarWhatsapp, verRecibo } from "@/lib/acciones-recibos";
import { fecha, mes } from "@/lib/format";
import { enlaceWhatsapp, mesCorto, nombreArchivoRecibo, textoRecibo, type DatosRecibo } from "@/lib/recibo";
import { Modal } from "./Modal";
import { ReciboVista } from "./ReciboVista";

type Props = {
  departamentoId: string | null; // null: cerrado
  mesIso: string; // AAAA-MM-01
  numero: string;
  administra?: boolean; // titular o coadministrador: WhatsApp y correo
  onCerrar: () => void;
};

// Vista previa formal del recibo con Descargar PDF, Compartir y, para la administración, WhatsApp y correo.
export function ReciboModal({ departamentoId, mesIso, numero, administra = false, onCerrar }: Props) {
  const [datos, setDatos] = useState<DatosRecibo | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  useEffect(() => {
    setDatos(null);
    setAviso(null);
    if (!departamentoId) return;
    let vigente = true;
    verRecibo(departamentoId, mesIso).then((r) => {
      if (!vigente) return;
      if (r.ok) setDatos(r.datos);
      else setAviso({ ok: false, texto: r.mensaje });
    });
    return () => {
      vigente = false;
    };
  }, [departamentoId, mesIso]);

  const urlPdf = departamentoId ? `/pdf/recibo?d=${departamentoId}&m=${mesCorto(mesIso)}` : "";

  async function compartir() {
    if (!datos) return;
    const texto = textoRecibo(datos);
    try {
      const blob = await (await fetch(urlPdf)).blob();
      const archivo = new File([blob], nombreArchivoRecibo(datos), { type: "application/pdf" });
      if (navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({ title: "Recibo de mantenimiento", text: texto, files: [archivo] });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: "Recibo de mantenimiento", text: texto });
        return;
      }
      await navigator.clipboard.writeText(texto);
      setAviso({ ok: true, texto: "Resumen del recibo copiado: pégalo donde quieras compartirlo." });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setAviso({ ok: false, texto: "Compartir no está disponible en este navegador." });
    }
  }

  function correo() {
    if (!departamentoId || !datos) return;
    const para = datos.departamento.correo ?? "el responsable";
    if (!confirm(`¿Generar el recibo y enviarlo a ${para}?`)) return;
    iniciar(async () => {
      const r = await enviarRecibo(departamentoId, mesIso);
      if (r.ok) setDatos(r.datos);
      setAviso({ ok: r.ok, texto: r.mensaje ?? "" });
    });
  }

  function whatsapp() {
    if (!departamentoId) return;
    iniciar(async () => {
      const r = await registrarWhatsapp(departamentoId, mesIso);
      if (r.ok) setDatos(r.datos);
      else setAviso({ ok: false, texto: r.mensaje });
    });
  }

  const rec = datos?.recibo;
  return (
    <Modal abierto={!!departamentoId} titulo={`Recibo de ${mes(mesIso)} · depto ${numero}`} onCerrar={onCerrar} amplio>
      {aviso && (
        <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${aviso.ok ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`} role="status">
          {aviso.texto}
        </p>
      )}
      {!datos ? (
        !aviso && <p className="py-10 text-center text-muted">Preparando el recibo…</p>
      ) : (
        <>
          <ReciboVista d={datos} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {administra && (
              <p className="min-w-[200px] flex-1 text-sm text-muted">
                {rec?.enviado_en
                  ? `Enviado el ${fecha(rec.enviado_en.slice(0, 10))} por ${rec.canal === "whatsapp" ? "WhatsApp" : "correo"}${rec.canal === "correo" && datos.departamento.correo ? ` a ${datos.departamento.correo}` : ""}.`
                  : datos.departamento.correo
                    ? `Se enviará a ${datos.departamento.correo}.`
                    : "El responsable no tiene correo registrado."}
              </p>
            )}
            <span className="flex-1" />
            <a className="btn quiet" href={`${urlPdf}&descargar=1`} download>
              Descargar PDF
            </a>
            <button className="btn quiet" onClick={compartir}>
              Compartir
            </button>
            {administra && (
              <>
                <a className="btn quiet" href={enlaceWhatsapp(datos)} target="_blank" rel="noreferrer" onClick={whatsapp}>
                  WhatsApp
                </a>
                <button className="btn" onClick={correo} disabled={pendiente}>
                  {pendiente ? "Enviando…" : rec?.enviado_en && rec.canal === "correo" ? "Reenviar por correo" : "Enviar por correo"}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
