// Plantillas de carga masiva de departamentos (RN-27)
export const PLANTILLA_EXCEL = "/plantillas/plantilla-departamentos.xlsx";
// Hoja en Google Drive de EDIFIKA (compartida como "cualquiera con el enlace puede ver")
export const PLANTILLA_SHEETS_ID = "1eSFReX51Tbg9glB9OlNLQ68483FzWagKJuWvvL6fIZA";
export const SITIO_PUBLICO = process.env.NEXT_PUBLIC_SITIO_URL || "https://edifika-app.vercel.app";

/** Abre la plantilla en Excel en línea (el visor de Office necesita la dirección pública del archivo). */
export const excelEnLinea = () =>
  `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(`${SITIO_PUBLICO}${PLANTILLA_EXCEL}`)}`;

/** "Hacer una copia" de la plantilla en el Google Drive de quien la abre. */
export const sheetsCopia = () => `https://docs.google.com/spreadsheets/d/${PLANTILLA_SHEETS_ID}/copy`;
