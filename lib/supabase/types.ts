export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      auditoria: {
        Row: {
          accion: string
          actor: string | null
          created_at: string
          datos: Json | null
          edificio_id: string | null
          entidad: string
          entidad_id: string | null
          id: number
        }
        Insert: {
          accion: string
          actor?: string | null
          created_at?: string
          datos?: Json | null
          edificio_id?: string | null
          entidad: string
          entidad_id?: string | null
          id?: never
        }
        Update: {
          accion?: string
          actor?: string | null
          created_at?: string
          datos?: Json | null
          edificio_id?: string | null
          entidad?: string
          entidad_id?: string | null
          id?: never
        }
        Relationships: []
      }
      ausencias: {
        Row: {
          created_at: string
          departamento_id: string
          desde: string
          edificio_id: string
          estado: string
          hasta: string
          id: string
          motivo: string
          nota: string | null
          resuelta_en: string | null
          resuelta_por: string | null
          solicitada_por: string | null
        }
        Insert: {
          created_at?: string
          departamento_id: string
          desde: string
          edificio_id: string
          estado?: string
          hasta: string
          id?: string
          motivo: string
          nota?: string | null
          resuelta_en?: string | null
          resuelta_por?: string | null
          solicitada_por?: string | null
        }
        Update: {
          created_at?: string
          departamento_id?: string
          desde?: string
          edificio_id?: string
          estado?: string
          hasta?: string
          id?: string
          motivo?: string
          nota?: string | null
          resuelta_en?: string | null
          resuelta_por?: string | null
          solicitada_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ausencias_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ausencias_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "v_departamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ausencias_edificio_id_fkey"
            columns: ["edificio_id"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ausencias_resuelta_por_fkey"
            columns: ["resuelta_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ausencias_solicitada_por_fkey"
            columns: ["solicitada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bloqueos_zona: {
        Row: {
          desde: string
          hasta: string
          id: string
          motivo: string
          zona_id: string
        }
        Insert: {
          desde: string
          hasta: string
          id?: string
          motivo: string
          zona_id: string
        }
        Update: {
          desde?: string
          hasta?: string
          id?: string
          motivo?: string
          zona_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bloqueos_zona_zona_id_fkey"
            columns: ["zona_id"]
            isOneToOne: false
            referencedRelation: "zonas_comunes"
            referencedColumns: ["id"]
          },
        ]
      }
      compromisos: {
        Row: {
          anulado_motivo: string | null
          concepto: string
          created_at: string
          departamento_id: string
          detalle: Json | null
          edificio_id: string
          emitido_en: string
          estado: Database["public"]["Enums"]["estado_compromiso"]
          id: string
          mes: string
          monto: number
          moroso: boolean
          tipo: Database["public"]["Enums"]["tipo_compromiso"]
          vence_en: string
        }
        Insert: {
          anulado_motivo?: string | null
          concepto: string
          created_at?: string
          departamento_id: string
          detalle?: Json | null
          edificio_id: string
          emitido_en?: string
          estado?: Database["public"]["Enums"]["estado_compromiso"]
          id?: string
          mes: string
          monto: number
          moroso?: boolean
          tipo: Database["public"]["Enums"]["tipo_compromiso"]
          vence_en: string
        }
        Update: {
          anulado_motivo?: string | null
          concepto?: string
          created_at?: string
          departamento_id?: string
          detalle?: Json | null
          edificio_id?: string
          emitido_en?: string
          estado?: Database["public"]["Enums"]["estado_compromiso"]
          id?: string
          mes?: string
          monto?: number
          moroso?: boolean
          tipo?: Database["public"]["Enums"]["tipo_compromiso"]
          vence_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "compromisos_departamento_id_edificio_id_fkey"
            columns: ["departamento_id", "edificio_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id", "edificio_id"]
          },
          {
            foreignKeyName: "compromisos_departamento_id_edificio_id_fkey"
            columns: ["departamento_id", "edificio_id"]
            isOneToOne: false
            referencedRelation: "v_departamentos"
            referencedColumns: ["id", "edificio_id"]
          },
        ]
      }
      cortes: {
        Row: {
          departamentos: string[]
          ejecutado_en: string
          periodo_id: string
        }
        Insert: {
          departamentos?: string[]
          ejecutado_en: string
          periodo_id: string
        }
        Update: {
          departamentos?: string[]
          ejecutado_en?: string
          periodo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cortes_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: true
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
        ]
      }
      departamentos: {
        Row: {
          area_m2: number | null
          created_at: string
          edificio_id: string
          id: string
          numero: string
          piso: number
        }
        Insert: {
          area_m2?: number | null
          created_at?: string
          edificio_id: string
          id?: string
          numero: string
          piso: number
        }
        Update: {
          area_m2?: number | null
          created_at?: string
          edificio_id?: string
          id?: string
          numero?: string
          piso?: number
        }
        Relationships: [
          {
            foreignKeyName: "departamentos_edificio_id_fkey"
            columns: ["edificio_id"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
        ]
      }
      depuraciones: {
        Row: {
          codigo: string
          creado_en: string | null
          depurado_en: string
          dias_inactivo: number
          edificio_id: string
          id: number
        }
        Insert: {
          codigo: string
          creado_en?: string | null
          depurado_en?: string
          dias_inactivo: number
          edificio_id: string
          id?: never
        }
        Update: {
          codigo?: string
          creado_en?: string | null
          depurado_en?: string
          dias_inactivo?: number
          edificio_id?: string
          id?: never
        }
        Relationships: []
      }
      edificios: {
        Row: {
          agua_cuota: string | null
          area_comun_m2: number | null
          area_total_m2: number | null
          aviso_inactividad: number
          base_cuota: string | null
          codigo: string
          creado_por: string | null
          created_at: string
          cuenta_bancaria: string | null
          dia_corte: number
          dia_lectura: number | null
          direccion: string
          id: string
          monto_fijo_mensual: number | null
          mora_monto: number
          nombre: string
          organizacion_id: string
          publicar_desglose: boolean
          saldo_inicial: number
          suscripcion_pagada: boolean
          tipo_calculo: Database["public"]["Enums"]["tipo_calculo"] | null
          total_departamentos: number
          ultima_actividad: string
          validador_designado_id: string | null
          yape_plin: string | null
        }
        Insert: {
          agua_cuota?: string | null
          area_comun_m2?: number | null
          area_total_m2?: number | null
          aviso_inactividad?: number
          base_cuota?: string | null
          codigo: string
          creado_por?: string | null
          created_at?: string
          cuenta_bancaria?: string | null
          dia_corte?: number
          dia_lectura?: number | null
          direccion: string
          id?: string
          monto_fijo_mensual?: number | null
          mora_monto?: number
          nombre: string
          organizacion_id: string
          publicar_desglose?: boolean
          saldo_inicial?: number
          suscripcion_pagada?: boolean
          tipo_calculo?: Database["public"]["Enums"]["tipo_calculo"] | null
          total_departamentos: number
          ultima_actividad?: string
          validador_designado_id?: string | null
          yape_plin?: string | null
        }
        Update: {
          agua_cuota?: string | null
          area_comun_m2?: number | null
          area_total_m2?: number | null
          aviso_inactividad?: number
          base_cuota?: string | null
          codigo?: string
          creado_por?: string | null
          created_at?: string
          cuenta_bancaria?: string | null
          dia_corte?: number
          dia_lectura?: number | null
          direccion?: string
          id?: string
          monto_fijo_mensual?: number | null
          mora_monto?: number
          nombre?: string
          organizacion_id?: string
          publicar_desglose?: boolean
          saldo_inicial?: number
          suscripcion_pagada?: boolean
          tipo_calculo?: Database["public"]["Enums"]["tipo_calculo"] | null
          total_departamentos?: number
          ultima_actividad?: string
          validador_designado_id?: string | null
          yape_plin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "edificios_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edificios_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edificios_validador_designado_id_fkey"
            columns: ["validador_designado_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          categoria: string
          creado_por: string | null
          created_at: string
          descripcion: string
          edificio_id: string
          fecha: string
          id: string
          monto: number
          origen: string
          periodo_id: string
          tipo: Database["public"]["Enums"]["tipo_gasto"]
        }
        Insert: {
          categoria: string
          creado_por?: string | null
          created_at?: string
          descripcion: string
          edificio_id: string
          fecha: string
          id?: string
          monto: number
          origen?: string
          periodo_id: string
          tipo: Database["public"]["Enums"]["tipo_gasto"]
        }
        Update: {
          categoria?: string
          creado_por?: string | null
          created_at?: string
          descripcion?: string
          edificio_id?: string
          fecha?: string
          id?: string
          monto?: number
          origen?: string
          periodo_id?: string
          tipo?: Database["public"]["Enums"]["tipo_gasto"]
        }
        Relationships: [
          {
            foreignKeyName: "gastos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_periodo_id_edificio_id_fkey"
            columns: ["periodo_id", "edificio_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id", "edificio_id"]
          },
        ]
      }
      lecturas_agua: {
        Row: {
          departamento_id: string
          m3: number
          periodo_id: string
        }
        Insert: {
          departamento_id: string
          m3: number
          periodo_id: string
        }
        Update: {
          departamento_id?: string
          m3?: number
          periodo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lecturas_agua_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lecturas_agua_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "v_departamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lecturas_agua_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
        ]
      }
      lecturas_medidor: {
        Row: {
          created_at: string
          fecha: string
          lectura: number
          lectura_anterior: number
          m3: number
          medidor_id: string
          periodo_id: string
          registrado_por: string | null
        }
        Insert: {
          created_at?: string
          fecha: string
          lectura: number
          lectura_anterior: number
          m3: number
          medidor_id: string
          periodo_id: string
          registrado_por?: string | null
        }
        Update: {
          created_at?: string
          fecha?: string
          lectura?: number
          lectura_anterior?: number
          m3?: number
          medidor_id?: string
          periodo_id?: string
          registrado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lecturas_medidor_medidor_id_fkey"
            columns: ["medidor_id"]
            isOneToOne: false
            referencedRelation: "medidores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lecturas_medidor_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lecturas_medidor_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      medidores: {
        Row: {
          activo: boolean | null
          created_at: string
          departamento_id: string
          edificio_id: string
          id: string
          instalado_en: string
          lectura_inicial: number
          numero_serie: string
          retirado_en: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string
          departamento_id: string
          edificio_id: string
          id?: string
          instalado_en?: string
          lectura_inicial?: number
          numero_serie: string
          retirado_en?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string
          departamento_id?: string
          edificio_id?: string
          id?: string
          instalado_en?: string
          lectura_inicial?: number
          numero_serie?: string
          retirado_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medidores_departamento_id_edificio_id_fkey"
            columns: ["departamento_id", "edificio_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id", "edificio_id"]
          },
          {
            foreignKeyName: "medidores_departamento_id_edificio_id_fkey"
            columns: ["departamento_id", "edificio_id"]
            isOneToOne: false
            referencedRelation: "v_departamentos"
            referencedColumns: ["id", "edificio_id"]
          },
        ]
      }
      membresias: {
        Row: {
          baja_en: string | null
          created_at: string
          departamento_id: string | null
          edificio_id: string
          estado: Database["public"]["Enums"]["estado_membresia"]
          id: string
          nivel: Database["public"]["Enums"]["nivel_admin"] | null
          perfil_id: string
          rol: Database["public"]["Enums"]["rol_membresia"]
          vigente_hasta: string | null
        }
        Insert: {
          baja_en?: string | null
          created_at?: string
          departamento_id?: string | null
          edificio_id: string
          estado?: Database["public"]["Enums"]["estado_membresia"]
          id?: string
          nivel?: Database["public"]["Enums"]["nivel_admin"] | null
          perfil_id: string
          rol: Database["public"]["Enums"]["rol_membresia"]
          vigente_hasta?: string | null
        }
        Update: {
          baja_en?: string | null
          created_at?: string
          departamento_id?: string | null
          edificio_id?: string
          estado?: Database["public"]["Enums"]["estado_membresia"]
          id?: string
          nivel?: Database["public"]["Enums"]["nivel_admin"] | null
          perfil_id?: string
          rol?: Database["public"]["Enums"]["rol_membresia"]
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "membresias_departamento_id_edificio_id_fkey"
            columns: ["departamento_id", "edificio_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id", "edificio_id"]
          },
          {
            foreignKeyName: "membresias_departamento_id_edificio_id_fkey"
            columns: ["departamento_id", "edificio_id"]
            isOneToOne: false
            referencedRelation: "v_departamentos"
            referencedColumns: ["id", "edificio_id"]
          },
          {
            foreignKeyName: "membresias_edificio_id_fkey"
            columns: ["edificio_id"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membresias_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mensajes: {
        Row: {
          autor_id: string
          created_at: string
          edificio_id: string
          id: string
          texto: string
        }
        Insert: {
          autor_id?: string
          created_at?: string
          edificio_id: string
          id?: string
          texto: string
        }
        Update: {
          autor_id?: string
          created_at?: string
          edificio_id?: string
          id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensajes_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_edificio_id_fkey"
            columns: ["edificio_id"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
        ]
      }
      modulos_edificio: {
        Row: {
          edificio_id: string
          estado: Database["public"]["Enums"]["estado_modulo"]
          modulo: string
          prueba_hasta: string | null
        }
        Insert: {
          edificio_id: string
          estado?: Database["public"]["Enums"]["estado_modulo"]
          modulo: string
          prueba_hasta?: string | null
        }
        Update: {
          edificio_id?: string
          estado?: Database["public"]["Enums"]["estado_modulo"]
          modulo?: string
          prueba_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "modulos_edificio_edificio_id_fkey"
            columns: ["edificio_id"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
        ]
      }
      ocupaciones: {
        Row: {
          activo: boolean | null
          departamento_id: string
          desde: string
          hasta: string | null
          id: string
          persona_id: string
          tipo: Database["public"]["Enums"]["tipo_ocupacion"]
        }
        Insert: {
          activo?: boolean | null
          departamento_id: string
          desde: string
          hasta?: string | null
          id?: string
          persona_id: string
          tipo: Database["public"]["Enums"]["tipo_ocupacion"]
        }
        Update: {
          activo?: boolean | null
          departamento_id?: string
          desde?: string
          hasta?: string | null
          id?: string
          persona_id?: string
          tipo?: Database["public"]["Enums"]["tipo_ocupacion"]
        }
        Relationships: [
          {
            foreignKeyName: "ocupaciones_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocupaciones_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "v_departamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocupaciones_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      organizaciones: {
        Row: {
          created_at: string
          id: string
          nombre: string
          plan: Database["public"]["Enums"]["plan_saas"]
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
          plan?: Database["public"]["Enums"]["plan_saas"]
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          plan?: Database["public"]["Enums"]["plan_saas"]
        }
        Relationships: []
      }
      pagos: {
        Row: {
          comprobante_path: string | null
          compromiso_id: string
          created_at: string
          departamento_id: string
          edificio_id: string
          estado: Database["public"]["Enums"]["estado_pago"]
          fecha_pago: string
          grupo: string | null
          id: string
          metodo: string
          monto: number
          nota_rechazo: string | null
          operacion: string | null
          registrado_por: string | null
          validado_en: string | null
          validado_por: string | null
        }
        Insert: {
          comprobante_path?: string | null
          compromiso_id: string
          created_at?: string
          departamento_id: string
          edificio_id: string
          estado?: Database["public"]["Enums"]["estado_pago"]
          fecha_pago?: string
          grupo?: string | null
          id?: string
          metodo: string
          monto: number
          nota_rechazo?: string | null
          operacion?: string | null
          registrado_por?: string | null
          validado_en?: string | null
          validado_por?: string | null
        }
        Update: {
          comprobante_path?: string | null
          compromiso_id?: string
          created_at?: string
          departamento_id?: string
          edificio_id?: string
          estado?: Database["public"]["Enums"]["estado_pago"]
          fecha_pago?: string
          grupo?: string | null
          id?: string
          metodo?: string
          monto?: number
          nota_rechazo?: string | null
          operacion?: string | null
          registrado_por?: string | null
          validado_en?: string | null
          validado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_compromiso_id_fkey"
            columns: ["compromiso_id"]
            isOneToOne: false
            referencedRelation: "compromisos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_compromiso_id_fkey"
            columns: ["compromiso_id"]
            isOneToOne: false
            referencedRelation: "v_compromisos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_departamento_id_edificio_id_fkey"
            columns: ["departamento_id", "edificio_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id", "edificio_id"]
          },
          {
            foreignKeyName: "pagos_departamento_id_edificio_id_fkey"
            columns: ["departamento_id", "edificio_id"]
            isOneToOne: false
            referencedRelation: "v_departamentos"
            referencedColumns: ["id", "edificio_id"]
          },
          {
            foreignKeyName: "pagos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_validado_por_fkey"
            columns: ["validado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles: {
        Row: {
          created_at: string
          id: string
          nombre: string
          telefono: string | null
        }
        Insert: {
          created_at?: string
          id: string
          nombre: string
          telefono?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          telefono?: string | null
        }
        Relationships: []
      }
      periodos: {
        Row: {
          confirmado_por: string | null
          edificio_id: string
          estado: Database["public"]["Enums"]["estado_periodo"]
          gastos_confirmados_en: string | null
          id: string
          mes: string
          titular_nombre: string | null
        }
        Insert: {
          confirmado_por?: string | null
          edificio_id: string
          estado?: Database["public"]["Enums"]["estado_periodo"]
          gastos_confirmados_en?: string | null
          id?: string
          mes: string
          titular_nombre?: string | null
        }
        Update: {
          confirmado_por?: string | null
          edificio_id?: string
          estado?: Database["public"]["Enums"]["estado_periodo"]
          gastos_confirmados_en?: string | null
          id?: string
          mes?: string
          titular_nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "periodos_confirmado_por_fkey"
            columns: ["confirmado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "periodos_edificio_id_fkey"
            columns: ["edificio_id"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
        ]
      }
      personas: {
        Row: {
          created_at: string
          documento: string | null
          edificio_id: string
          email: string | null
          id: string
          nombre: string
          perfil_id: string | null
          telefono: string | null
        }
        Insert: {
          created_at?: string
          documento?: string | null
          edificio_id: string
          email?: string | null
          id?: string
          nombre: string
          perfil_id?: string | null
          telefono?: string | null
        }
        Update: {
          created_at?: string
          documento?: string | null
          edificio_id?: string
          email?: string | null
          id?: string
          nombre?: string
          perfil_id?: string | null
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personas_edificio_id_fkey"
            columns: ["edificio_id"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personas_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plataforma_admins: {
        Row: {
          created_at: string
          perfil_id: string
        }
        Insert: {
          created_at?: string
          perfil_id: string
        }
        Update: {
          created_at?: string
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plataforma_admins_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: true
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recibos: {
        Row: {
          canal: string | null
          created_at: string
          departamento_id: string
          edificio_id: string
          enviado_en: string | null
          id: string
          mes: string
          numero: string
          pdf_path: string | null
          titular_nombre: string | null
          total: number
        }
        Insert: {
          canal?: string | null
          created_at?: string
          departamento_id: string
          edificio_id: string
          enviado_en?: string | null
          id?: string
          mes: string
          numero: string
          pdf_path?: string | null
          titular_nombre?: string | null
          total: number
        }
        Update: {
          canal?: string | null
          created_at?: string
          departamento_id?: string
          edificio_id?: string
          enviado_en?: string | null
          id?: string
          mes?: string
          numero?: string
          pdf_path?: string | null
          titular_nombre?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "recibos_departamento_id_edificio_id_fkey"
            columns: ["departamento_id", "edificio_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id", "edificio_id"]
          },
          {
            foreignKeyName: "recibos_departamento_id_edificio_id_fkey"
            columns: ["departamento_id", "edificio_id"]
            isOneToOne: false
            referencedRelation: "v_departamentos"
            referencedColumns: ["id", "edificio_id"]
          },
        ]
      }
      recibos_agua: {
        Row: {
          consumo_m3: number
          monto: number
          periodo_id: string
          riego_m3: number
        }
        Insert: {
          consumo_m3: number
          monto: number
          periodo_id: string
          riego_m3?: number
        }
        Update: {
          consumo_m3?: number
          monto?: number
          periodo_id?: string
          riego_m3?: number
        }
        Relationships: [
          {
            foreignKeyName: "recibos_agua_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: true
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
        ]
      }
      reservas: {
        Row: {
          acepto_reglamento_en: string
          compromiso_garantia: string | null
          compromiso_tarifa: string | null
          created_at: string
          departamento_id: string
          edificio_id: string
          estado: Database["public"]["Enums"]["estado_reserva"]
          fin: string
          garantia_cerrada_en: string | null
          garantia_estado: Database["public"]["Enums"]["estado_garantia"]
          garantia_monto: number
          garantia_retenida: number
          gestionada_por: string | null
          id: string
          inicio: string
          nota: string | null
          solicitada_por: string | null
          vence_pago_en: string | null
          zona_id: string
        }
        Insert: {
          acepto_reglamento_en: string
          compromiso_garantia?: string | null
          compromiso_tarifa?: string | null
          created_at?: string
          departamento_id: string
          edificio_id: string
          estado: Database["public"]["Enums"]["estado_reserva"]
          fin: string
          garantia_cerrada_en?: string | null
          garantia_estado?: Database["public"]["Enums"]["estado_garantia"]
          garantia_monto?: number
          garantia_retenida?: number
          gestionada_por?: string | null
          id?: string
          inicio: string
          nota?: string | null
          solicitada_por?: string | null
          vence_pago_en?: string | null
          zona_id: string
        }
        Update: {
          acepto_reglamento_en?: string
          compromiso_garantia?: string | null
          compromiso_tarifa?: string | null
          created_at?: string
          departamento_id?: string
          edificio_id?: string
          estado?: Database["public"]["Enums"]["estado_reserva"]
          fin?: string
          garantia_cerrada_en?: string | null
          garantia_estado?: Database["public"]["Enums"]["estado_garantia"]
          garantia_monto?: number
          garantia_retenida?: number
          gestionada_por?: string | null
          id?: string
          inicio?: string
          nota?: string | null
          solicitada_por?: string | null
          vence_pago_en?: string | null
          zona_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservas_compromiso_garantia_fkey"
            columns: ["compromiso_garantia"]
            isOneToOne: false
            referencedRelation: "compromisos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_compromiso_garantia_fkey"
            columns: ["compromiso_garantia"]
            isOneToOne: false
            referencedRelation: "v_compromisos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_compromiso_tarifa_fkey"
            columns: ["compromiso_tarifa"]
            isOneToOne: false
            referencedRelation: "compromisos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_compromiso_tarifa_fkey"
            columns: ["compromiso_tarifa"]
            isOneToOne: false
            referencedRelation: "v_compromisos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_departamento_id_edificio_id_fkey"
            columns: ["departamento_id", "edificio_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id", "edificio_id"]
          },
          {
            foreignKeyName: "reservas_departamento_id_edificio_id_fkey"
            columns: ["departamento_id", "edificio_id"]
            isOneToOne: false
            referencedRelation: "v_departamentos"
            referencedColumns: ["id", "edificio_id"]
          },
          {
            foreignKeyName: "reservas_gestionada_por_fkey"
            columns: ["gestionada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_solicitada_por_fkey"
            columns: ["solicitada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_zona_id_fkey"
            columns: ["zona_id"]
            isOneToOne: false
            referencedRelation: "zonas_comunes"
            referencedColumns: ["id"]
          },
        ]
      }
      saldo_favor: {
        Row: {
          compromiso_id: string | null
          concepto: string
          created_at: string
          departamento_id: string
          edificio_id: string
          fecha: string
          id: number
          monto: number
        }
        Insert: {
          compromiso_id?: string | null
          concepto: string
          created_at?: string
          departamento_id: string
          edificio_id: string
          fecha?: string
          id?: never
          monto: number
        }
        Update: {
          compromiso_id?: string | null
          concepto?: string
          created_at?: string
          departamento_id?: string
          edificio_id?: string
          fecha?: string
          id?: never
          monto?: number
        }
        Relationships: [
          {
            foreignKeyName: "saldo_favor_compromiso_id_fkey"
            columns: ["compromiso_id"]
            isOneToOne: false
            referencedRelation: "compromisos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saldo_favor_compromiso_id_fkey"
            columns: ["compromiso_id"]
            isOneToOne: false
            referencedRelation: "v_compromisos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saldo_favor_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saldo_favor_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "v_departamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saldo_favor_edificio_id_fkey"
            columns: ["edificio_id"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
        ]
      }
      zonas_comunes: {
        Row: {
          activa: boolean
          aforo: number | null
          anticipacion_max_dias: number
          anticipacion_min_dias: number
          created_at: string
          descripcion: string | null
          dias_semana: number[]
          duracion_turno_min: number
          edificio_id: string
          garantia: number
          hora_apertura: string
          hora_cierre: string
          id: string
          max_reservas_mes: number
          nombre: string
          permite_morosos: boolean
          plazo_pago_horas: number
          reglamento: string
          requiere_aprobacion: boolean
          tarifa: number
        }
        Insert: {
          activa?: boolean
          aforo?: number | null
          anticipacion_max_dias?: number
          anticipacion_min_dias?: number
          created_at?: string
          descripcion?: string | null
          dias_semana?: number[]
          duracion_turno_min?: number
          edificio_id: string
          garantia?: number
          hora_apertura?: string
          hora_cierre?: string
          id?: string
          max_reservas_mes?: number
          nombre: string
          permite_morosos?: boolean
          plazo_pago_horas?: number
          reglamento?: string
          requiere_aprobacion?: boolean
          tarifa?: number
        }
        Update: {
          activa?: boolean
          aforo?: number | null
          anticipacion_max_dias?: number
          anticipacion_min_dias?: number
          created_at?: string
          descripcion?: string | null
          dias_semana?: number[]
          duracion_turno_min?: number
          edificio_id?: string
          garantia?: number
          hora_apertura?: string
          hora_cierre?: string
          id?: string
          max_reservas_mes?: number
          nombre?: string
          permite_morosos?: boolean
          plazo_pago_horas?: number
          reglamento?: string
          requiere_aprobacion?: boolean
          tarifa?: number
        }
        Relationships: [
          {
            foreignKeyName: "zonas_comunes_edificio_id_fkey"
            columns: ["edificio_id"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_compromisos: {
        Row: {
          anulado_motivo: string | null
          concepto: string | null
          created_at: string | null
          departamento_id: string | null
          detalle: Json | null
          edificio_id: string | null
          emitido_en: string | null
          estado: Database["public"]["Enums"]["estado_compromiso"] | null
          estado_visible: string | null
          id: string | null
          mes: string | null
          monto: number | null
          moroso: boolean | null
          por_cobrar: boolean | null
          tipo: Database["public"]["Enums"]["tipo_compromiso"] | null
          vence_en: string | null
        }
        Insert: {
          anulado_motivo?: string | null
          concepto?: string | null
          created_at?: string | null
          departamento_id?: string | null
          detalle?: Json | null
          edificio_id?: string | null
          emitido_en?: string | null
          estado?: Database["public"]["Enums"]["estado_compromiso"] | null
          estado_visible?: never
          id?: string | null
          mes?: string | null
          monto?: number | null
          moroso?: boolean | null
          por_cobrar?: never
          tipo?: Database["public"]["Enums"]["tipo_compromiso"] | null
          vence_en?: string | null
        }
        Update: {
          anulado_motivo?: string | null
          concepto?: string | null
          created_at?: string | null
          departamento_id?: string | null
          detalle?: Json | null
          edificio_id?: string | null
          emitido_en?: string | null
          estado?: Database["public"]["Enums"]["estado_compromiso"] | null
          estado_visible?: never
          id?: string | null
          mes?: string | null
          monto?: number | null
          moroso?: boolean | null
          por_cobrar?: never
          tipo?: Database["public"]["Enums"]["tipo_compromiso"] | null
          vence_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compromisos_departamento_id_edificio_id_fkey"
            columns: ["departamento_id", "edificio_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id", "edificio_id"]
          },
          {
            foreignKeyName: "compromisos_departamento_id_edificio_id_fkey"
            columns: ["departamento_id", "edificio_id"]
            isOneToOne: false
            referencedRelation: "v_departamentos"
            referencedColumns: ["id", "edificio_id"]
          },
        ]
      }
      v_departamentos: {
        Row: {
          alicuota: number | null
          area_m2: number | null
          created_at: string | null
          edificio_id: string | null
          id: string | null
          numero: string | null
          piso: number | null
        }
        Relationships: [
          {
            foreignKeyName: "departamentos_edificio_id_fkey"
            columns: ["edificio_id"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
        ]
      }
      v_equipo_admin: {
        Row: {
          created_at: string | null
          departamento_id: string | null
          edificio_id: string | null
          nivel: Database["public"]["Enums"]["nivel_admin"] | null
          nombre: string | null
          perfil_id: string | null
          vigente_hasta: string | null
        }
        Relationships: [
          {
            foreignKeyName: "membresias_edificio_id_fkey"
            columns: ["edificio_id"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membresias_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _emitir_cargos_reserva: {
        Args: { p_reserva: string }
        Returns: undefined
      }
      _exigir_gestor_reserva: {
        Args: { r: Database["public"]["Tables"]["reservas"]["Row"] }
        Returns: undefined
      }
      _transferir_titularidad: {
        Args: {
          p_acta: string
          p_edificio: string
          p_forzada: boolean
          p_nuevo: string
          p_saliente: string
        }
        Returns: undefined
      }
      abrir_periodo: {
        Args: { p_edificio: string; p_recurrentes?: Json }
        Returns: string
      }
      activar_prueba: {
        Args: { p_edificio: string; p_modulo: string }
        Returns: string
      }
      actualizar_departamentos: {
        Args: { p_edificio: string; p_filas: Json }
        Returns: number
      }
      agregar_coadministrador: {
        Args: { p_edificio: string; p_perfil: string }
        Returns: string
      }
      anular_compromiso: {
        Args: { p_compromiso: string; p_motivo: string }
        Returns: undefined
      }
      aprobar_reserva: { Args: { p_reserva: string }; Returns: undefined }
      ausencias_admin: {
        Args: { p_edificio: string }
        Returns: {
          ausencia_id: string
          creada: string
          departamento_id: string
          desde: string
          estado: string
          hasta: string
          motivo: string
          nota: string
          numero: string
          puede_resolver: boolean
          resuelta_por: string
          solicitante: string
        }[]
      }
      calcular_cuotas: {
        Args: { p_periodo: string }
        Returns: {
          agua: number
          alicuota: number
          area_m2: number
          comun: number
          departamento_id: string
          m3: number
          numero: string
          total: number
        }[]
      }
      cambiar_acceso: {
        Args: { p_activo: boolean; p_departamento: string }
        Returns: undefined
      }
      cancelar_adelanto: { Args: { p_compromiso: string }; Returns: undefined }
      cancelar_ausencia: { Args: { p_ausencia: string }; Returns: undefined }
      cancelar_reserva: {
        Args: { p_motivo?: string; p_reserva: string }
        Returns: undefined
      }
      cerrar_reserva: {
        Args: { p_nota?: string; p_reserva: string; p_retener?: number }
        Returns: undefined
      }
      codigo_disponible: { Args: { p_codigo: string }; Returns: boolean }
      compromisos_admin: {
        Args: { p_edificio: string }
        Returns: {
          anulado_motivo: string
          compromiso_id: string
          concepto: string
          departamento_id: string
          emitido_en: string
          estado: Database["public"]["Enums"]["estado_compromiso"]
          estado_visible: string
          mes: string
          monto: number
          numero: string
          pago_fecha: string
          pago_metodo: string
          puede_validar: boolean
          soy_titular: boolean
          tipo: Database["public"]["Enums"]["tipo_compromiso"]
          ultimo_rechazo: string
          validado_por: string
          vence_en: string
        }[]
      }
      confirmar_gastos: { Args: { p_periodo: string }; Returns: undefined }
      crear_edificio: {
        Args: {
          p_area_total: number
          p_codigo: string
          p_direccion: string
          p_mes_inicio: string
          p_mi_nombre: string
          p_nombre: string
          p_organizacion?: string
          p_organizacion_nombre?: string
          p_tipo_calculo: Database["public"]["Enums"]["tipo_calculo"]
          p_total_departamentos: number
        }
        Returns: string
      }
      cuenta_corriente: {
        Args: { p_departamento: string }
        Returns: {
          abono: number
          cargo: number
          concepto: string
          estado: string
          fecha: string
          saldo: number
          tipo: string
        }[]
      }
      cuentas_por_cobrar: {
        Args: { p_edificio: string }
        Returns: {
          departamento_id: string
          numero: string
          pendiente: number
          saldo_favor: number
          vencido: number
        }[]
      }
      departamentos_admin: {
        Args: { p_edificio: string }
        Returns: {
          acceso: string
          alicuota: number
          area_m2: number
          departamento_id: string
          inquilino: string
          inquilino_email: string
          inquilino_id: string
          inquilino_telefono: string
          medidor_desde: string
          medidor_id: string
          medidor_lectura_inicial: number
          medidor_serie: string
          numero: string
          piso: number
          propietario: string
          propietario_email: string
          propietario_id: string
          propietario_telefono: string
          responsable: string
          responsable_tiene_correo: boolean
        }[]
      }
      depto_del_titular: { Args: { p_edificio: string }; Returns: string }
      depurar_edificio: { Args: { p_edificio: string }; Returns: string[] }
      designar_validador: {
        Args: { p_edificio: string; p_perfil: string }
        Returns: undefined
      }
      devolver_garantia: { Args: { p_reserva: string }; Returns: undefined }
      dias_sin_movimiento: { Args: { p_edificio: string }; Returns: number }
      dias_transicion: { Args: never; Returns: number }
      disponibilidad: {
        Args: { p_fecha: string; p_zona: string }
        Returns: {
          fin: string
          inicio: string
          libre: boolean
          motivo: string
        }[]
      }
      edificio_de_depto: { Args: { p_departamento: string }; Returns: string }
      edificios_por_depurar: {
        Args: never
        Returns: {
          accion: string
          aviso: number
          codigo: string
          dias: number
          edificio_id: string
          nombre: string
          titular: string
        }[]
      }
      ejecutar_cortes: { Args: never; Returns: number }
      emitir_extraordinario: {
        Args: {
          p_concepto: string
          p_departamento?: string
          p_edificio: string
          p_monto: number
          p_reparto: string
          p_vence: string
        }
        Returns: number
      }
      equipo_admin: {
        Args: { p_edificio: string }
        Returns: {
          departamento_numero: string
          desde: string
          nivel: Database["public"]["Enums"]["nivel_admin"]
          nombre: string
          perfil_id: string
          soy_yo: boolean
          vigente_hasta: string
        }[]
      }
      es_admin: { Args: { p_edificio: string }; Returns: boolean }
      es_de_mi_depto: { Args: { p_departamento: string }; Returns: boolean }
      es_lector_admin: { Args: { p_edificio: string }; Returns: boolean }
      es_miembro: { Args: { p_edificio: string }; Returns: boolean }
      es_plataforma: { Args: never; Returns: boolean }
      es_titular: { Args: { p_edificio: string }; Returns: boolean }
      es_validador_designado: { Args: { p_edificio: string }; Returns: boolean }
      estado_acceso: { Args: { p_departamento: string }; Returns: string }
      estado_configuracion: {
        Args: { p_edificio: string }
        Returns: {
          agua_cuota: string
          area_comun: number
          area_departamentos: number
          base_cuota: string
          cobranza_lista: boolean
          con_area: number
          con_medidor: number
          departamentos: number
          dia_lectura: number
          monto_fijo: number
          total_declarado: number
        }[]
      }
      estado_departamentos: {
        Args: { p_edificio: string }
        Returns: {
          departamento_id: string
          deuda: number
          en_revision: number
          estado: string
          numero: string
          piso: number
          responsable: string
          vencido: number
        }[]
      }
      estado_inactividad: {
        Args: { p_edificio: string }
        Returns: {
          dias_para_eliminar: number
          dias_sin_movimiento: number
          protegido: boolean
        }[]
      }
      estado_validacion: {
        Args: { p_edificio: string }
        Returns: {
          alerta: boolean
          coadministradores: number
          quien_valida: string
          titular_departamento: string
          titular_vive_en_edificio: boolean
          validador_departamento: string
          validador_nombre: string
          validador_perfil: string
        }[]
      }
      exigir_cobranza_configurada: {
        Args: { p_edificio: string }
        Returns: {
          agua_cuota: string | null
          area_comun_m2: number | null
          area_total_m2: number | null
          aviso_inactividad: number
          base_cuota: string | null
          codigo: string
          creado_por: string | null
          created_at: string
          cuenta_bancaria: string | null
          dia_corte: number
          dia_lectura: number | null
          direccion: string
          id: string
          monto_fijo_mensual: number | null
          mora_monto: number
          nombre: string
          organizacion_id: string
          publicar_desglose: boolean
          saldo_inicial: number
          suscripcion_pagada: boolean
          tipo_calculo: Database["public"]["Enums"]["tipo_calculo"] | null
          total_departamentos: number
          ultima_actividad: string
          validador_designado_id: string | null
          yape_plin: string | null
        }
        SetofOptions: {
          from: "*"
          to: "edificios"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      exigir_puede_validar: {
        Args: { p_departamento: string; p_edificio: string }
        Returns: undefined
      }
      expirar_reservas: { Args: never; Returns: number }
      garantias_en_custodia: {
        Args: { p_edificio: string }
        Returns: {
          en_custodia: number
          por_devolver: number
        }[]
      }
      hay_operador: { Args: { p_edificio: string }; Returns: boolean }
      historial_ocupantes: {
        Args: { p_edificio: string }
        Returns: {
          desde: string
          hasta: string
          nombre: string
          numero: string
          tipo: Database["public"]["Enums"]["tipo_ocupacion"]
        }[]
      }
      hoy_lima: { Args: never; Returns: string }
      importar_departamentos: {
        Args: { p_edificio: string; p_filas: Json }
        Returns: number
      }
      ingresos_por_tipo: {
        Args: { p_periodo: string }
        Returns: {
          monto: number
          pagos: number
          tipo: string
        }[]
      }
      lectura_anterior: {
        Args: { p_medidor: string; p_periodo: string }
        Returns: number
      }
      lecturas_del_periodo: {
        Args: { p_periodo: string }
        Returns: {
          departamento_id: string
          fecha: string
          lectura: number
          lectura_anterior: number
          m3: number
          medidor_id: string
          numero: string
          numero_serie: string
        }[]
      }
      marcar_aviso_inactividad: {
        Args: { p_aviso: number; p_edificio: string }
        Returns: undefined
      }
      mes_es: { Args: { p: string }; Returns: string }
      mi_departamento_en: { Args: { p_edificio: string }; Returns: string }
      mis_edificios: {
        Args: never
        Returns: {
          codigo: string
          departamento_id: string
          edificio_id: string
          nivel: Database["public"]["Enums"]["nivel_admin"]
          nombre: string
        }[]
      }
      modulo_habilitado: {
        Args: { p_edificio: string; p_modulo: string }
        Returns: boolean
      }
      nivel_admin_de: {
        Args: { p_edificio: string }
        Returns: Database["public"]["Enums"]["nivel_admin"]
      }
      pagos_por_validar: {
        Args: { p_edificio: string }
        Returns: {
          comprobante_path: string
          concepto: string
          departamento_id: string
          enviado_en: string
          fecha_pago: string
          grupo: string
          metodo: string
          monto: number
          motivo: string
          numero: string
          operacion: string
          pago_id: string
          puede_validar: boolean
          registrado_por: string
          tipo: Database["public"]["Enums"]["tipo_compromiso"]
        }[]
      }
      parte_fija_actual: { Args: { p_edificio: string }; Returns: number }
      puede_aprobar_ausencia: {
        Args: { p_departamento: string; p_edificio: string }
        Returns: boolean
      }
      puede_validar_pago: {
        Args: { p_departamento: string; p_edificio: string }
        Returns: boolean
      }
      quitar_coadministrador: {
        Args: { p_edificio: string; p_perfil: string }
        Returns: undefined
      }
      rechazar_grupo: {
        Args: { p_grupo: string; p_nota: string }
        Returns: number
      }
      rechazar_pago: {
        Args: { p_nota: string; p_pago: string }
        Returns: undefined
      }
      rechazar_reserva: {
        Args: { p_motivo: string; p_reserva: string }
        Returns: undefined
      }
      registrar_cambio_ocupante: {
        Args: {
          p_departamento: string
          p_desde: string
          p_documento: string
          p_email: string
          p_nombre: string
          p_telefono: string
          p_tipo: Database["public"]["Enums"]["tipo_ocupacion"]
        }
        Returns: string
      }
      registrar_edificio: {
        Args: {
          p_codigo: string
          p_direccion: string
          p_filas?: Json
          p_mes_inicio: string
          p_mi_nombre: string
          p_nombre: string
          p_organizacion?: string
          p_organizacion_nombre?: string
          p_total_departamentos: number
        }
        Returns: string
      }
      registrar_lecturas: {
        Args: { p_fecha: string; p_lecturas: Json; p_periodo: string }
        Returns: number
      }
      registrar_medidor: {
        Args: {
          p_departamento: string
          p_fecha?: string
          p_lectura_inicial?: number
          p_numero_serie: string
        }
        Returns: string
      }
      registrar_pago_efectivo: {
        Args: { p_compromiso: string }
        Returns: string
      }
      regreso_de_ausencia: {
        Args: { p_departamento: string; p_fecha: string }
        Returns: string
      }
      resolver_ausencia: {
        Args: { p_aprobar: boolean; p_ausencia: string; p_nota?: string }
        Returns: undefined
      }
      responsable_de: { Args: { p_departamento: string }; Returns: string }
      resumen_mis_edificios: {
        Args: never
        Returns: {
          codigo: string
          departamento_id: string
          departamento_numero: string
          departamentos: number
          departamentos_morosos: number
          dias_para_eliminar: number
          dias_sin_movimiento: number
          edificio_id: string
          nivel: Database["public"]["Enums"]["nivel_admin"]
          nombre: string
          organizacion_id: string
          pagos_por_validar: number
        }[]
      }
      resumen_periodo: {
        Args: { p_periodo: string }
        Returns: {
          acumulado: number
          administrador: string
          gastos: number
          ingresos: number
          mes: string
          oficial: boolean
          saldo_anterior: number
        }[]
      }
      saldo_a_favor: { Args: { p_departamento: string }; Returns: number }
      solicitar_adelanto: {
        Args: { p_edificio: string; p_meses?: number; p_monto?: number }
        Returns: string
      }
      solicitar_ausencia: {
        Args: {
          p_desde: string
          p_edificio: string
          p_hasta: string
          p_motivo: string
        }
        Returns: string
      }
      solicitar_reserva: {
        Args: { p_acepto_reglamento: boolean; p_inicio: string; p_zona: string }
        Returns: string
      }
      titular_nombre: { Args: { p_edificio: string }; Returns: string }
      titular_perfil: { Args: { p_edificio: string }; Returns: string }
      transferencia_forzada: {
        Args: { p_acta_path: string; p_edificio: string; p_nuevo: string }
        Returns: undefined
      }
      transferir_titularidad: {
        Args: { p_edificio: string; p_nuevo: string; p_saliente?: string }
        Returns: undefined
      }
      validar_grupo: { Args: { p_grupo: string }; Returns: number }
      validar_pago: { Args: { p_pago: string }; Returns: undefined }
      vecinos_con_cuenta: {
        Args: { p_edificio: string }
        Returns: {
          departamento_id: string
          departamento_numero: string
          es_validador: boolean
          nivel: Database["public"]["Enums"]["nivel_admin"]
          nombre: string
          perfil_id: string
          vive_con_titular: boolean
        }[]
      }
    }
    Enums: {
      estado_compromiso: "pendiente" | "en_revision" | "pagado" | "anulado"
      estado_garantia:
        | "sin_garantia"
        | "por_cobrar"
        | "en_custodia"
        | "por_devolver"
        | "devuelta"
        | "retenida"
      estado_membresia: "activo" | "inactivo"
      estado_modulo: "activo" | "prueba" | "bloqueado"
      estado_pago: "en_revision" | "validado" | "rechazado"
      estado_periodo: "abierto" | "cerrado"
      estado_reserva:
        | "solicitada"
        | "pendiente_pago"
        | "confirmada"
        | "usada"
        | "cancelada"
        | "rechazada"
        | "expirada"
      nivel_admin: "titular" | "operador" | "lectura"
      plan_saas: "basico" | "pro" | "premium"
      rol_membresia: "admin" | "habitante"
      tipo_calculo: "alicuota" | "mixta_agua"
      tipo_compromiso:
        | "cuota"
        | "mora"
        | "extraordinario"
        | "adelanto"
        | "ajuste"
        | "reserva"
        | "garantia"
      tipo_gasto: "recurrente" | "extraordinario"
      tipo_ocupacion: "propietario" | "inquilino"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      estado_compromiso: ["pendiente", "en_revision", "pagado", "anulado"],
      estado_garantia: [
        "sin_garantia",
        "por_cobrar",
        "en_custodia",
        "por_devolver",
        "devuelta",
        "retenida",
      ],
      estado_membresia: ["activo", "inactivo"],
      estado_modulo: ["activo", "prueba", "bloqueado"],
      estado_pago: ["en_revision", "validado", "rechazado"],
      estado_periodo: ["abierto", "cerrado"],
      estado_reserva: [
        "solicitada",
        "pendiente_pago",
        "confirmada",
        "usada",
        "cancelada",
        "rechazada",
        "expirada",
      ],
      nivel_admin: ["titular", "operador", "lectura"],
      plan_saas: ["basico", "pro", "premium"],
      rol_membresia: ["admin", "habitante"],
      tipo_calculo: ["alicuota", "mixta_agua"],
      tipo_compromiso: [
        "cuota",
        "mora",
        "extraordinario",
        "adelanto",
        "ajuste",
        "reserva",
        "garantia",
      ],
      tipo_gasto: ["recurrente", "extraordinario"],
      tipo_ocupacion: ["propietario", "inquilino"],
    },
  },
} as const
