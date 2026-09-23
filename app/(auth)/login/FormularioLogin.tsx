"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ingresar, type EstadoLogin } from "./acciones";
import { CampoClave } from "@/components/CampoClave";

export function FormularioLogin({ mensaje }: { mensaje?: string }) {
  const [estado, enviar, enviando] = useActionState<EstadoLogin, FormData>(ingresar, {
    error: null,
    modo: "habitante",
  });
  const [modo, setModo] = useState<"habitante" | "admin">(estado.modo);

  const pestaña = (m: typeof modo, texto: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={modo === m}
      onClick={() => setModo(m)}
      className={`flex-1 border-b-[3px] px-3 py-2 font-semibold ${
        modo === m ? "border-brand text-ink" : "border-transparent text-muted"
      }`}
    >
      {texto}
    </button>
  );

  return (
    <>
      <div role="tablist" className="mt-5 mb-4 flex border-b border-line">
        {pestaña("habitante", "Vecino")}
        {pestaña("admin", "Administración")}
      </div>

      <form action={enviar} key={modo}>
        <input type="hidden" name="modo" value={modo} />
        {mensaje && !estado.error && <p className="aviso">{mensaje}</p>}
        {estado.error && estado.modo === modo && (
          <p className="err" role="alert">
            {estado.error}
          </p>
        )}

        {modo === "habitante" ? (
          <>
            <div className="field">
              <label htmlFor="lg-c">Código del edificio</label>
              <input id="lg-c" name="codigo" autoComplete="organization" placeholder="Ej. los-ficus" required />
            </div>
            <div className="field">
              <label htmlFor="lg-n">N.° de departamento</label>
              <input id="lg-n" name="numero" autoComplete="username" placeholder="Ej. 302" required />
            </div>
          </>
        ) : (
          <div className="field">
            <label htmlFor="lg-e">Correo</label>
            <input id="lg-e" name="email" type="email" autoComplete="email" placeholder="tu@correo.com" required />
          </div>
        )}

        <div className="field">
          <label htmlFor="lg-p">Contraseña</label>
          <CampoClave id="lg-p" name="password" autoComplete="current-password" required />
        </div>

        <button className="btn w-full" disabled={enviando}>
          {enviando ? "Ingresando…" : "Ingresar"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm">
        <Link href="/recuperar" className="font-semibold text-brand underline-offset-2 hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>

      <div className="mt-5 border-t border-line pt-4">
        <p className="mb-2 text-sm text-muted">¿Administras un edificio?</p>
        <Link href="/registro" className="btn quiet w-full">
          Crear cuenta y registrar mi edificio
        </Link>
      </div>
    </>
  );
}
