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
      predictions: {
        Row: {
          created_at: string
          id: number
          obs_date: string
          score_forest: number | null
          score_soil: number | null
          score_total: number
          score_weather: number | null
          species_id: number
          weather_zone_id: number
        }
        Insert: {
          created_at?: string
          id?: never
          obs_date?: string
          score_forest?: number | null
          score_soil?: number | null
          score_total: number
          score_weather?: number | null
          species_id: number
          weather_zone_id: number
        }
        Update: {
          created_at?: string
          id?: never
          obs_date?: string
          score_forest?: number | null
          score_soil?: number | null
          score_total?: number
          score_weather?: number | null
          species_id?: number
          weather_zone_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "predictions_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_weather_zone_id_fkey"
            columns: ["weather_zone_id"]
            isOneToOne: false
            referencedRelation: "weather_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      species: {
        Row: {
          created_at: string
          id: number
          name_sv: string
          season_end: string | null
          season_start: string | null
          slug: string
          tier: string
        }
        Insert: {
          created_at?: string
          id?: never
          name_sv: string
          season_end?: string | null
          season_start?: string | null
          slug: string
          tier?: string
        }
        Update: {
          created_at?: string
          id?: never
          name_sv?: string
          season_end?: string | null
          season_start?: string | null
          slug?: string
          tier?: string
        }
        Relationships: []
      }
      user_badges: {
        Row: {
          badge_key: string
          description: string | null
          icon_url: string | null
          title: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          badge_key: string
          description?: string | null
          icon_url?: string | null
          title: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          badge_key?: string
          description?: string | null
          icon_url?: string | null
          title?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_discoveries: {
        Row: {
          ai_confidence: number
          created_at: string
          id: number
          image_url: string
          notes: string | null
          points_awarded: number
          quantity: string | null
          species_id: number
          user_id: string
          weather_zone_id: number
        }
        Insert: {
          ai_confidence: number
          created_at?: string
          id?: never
          image_url: string
          notes?: string | null
          points_awarded?: number
          quantity?: string | null
          species_id: number
          user_id: string
          weather_zone_id: number
        }
        Update: {
          ai_confidence?: number
          created_at?: string
          id?: never
          image_url?: string
          notes?: string | null
          points_awarded?: number
          quantity?: string | null
          species_id?: number
          user_id?: string
          weather_zone_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_discoveries_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_discoveries_weather_zone_id_fkey"
            columns: ["weather_zone_id"]
            isOneToOne: false
            referencedRelation: "weather_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          is_premium: boolean
          level: number
          total_points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          is_premium?: boolean
          level?: number
          total_points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          is_premium?: boolean
          level?: number
          total_points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weather_observations: {
        Row: {
          moisture_score: number | null
          obs_date: string
          precip_10d_sum: number | null
          precip_7d_sum: number | null
          temp_mean: number | null
          weather_zone_id: number
        }
        Insert: {
          moisture_score?: number | null
          obs_date: string
          precip_10d_sum?: number | null
          precip_7d_sum?: number | null
          temp_mean?: number | null
          weather_zone_id: number
        }
        Update: {
          moisture_score?: number | null
          obs_date?: string
          precip_10d_sum?: number | null
          precip_7d_sum?: number | null
          temp_mean?: number | null
          weather_zone_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "weather_observations_weather_zone_id_fkey"
            columns: ["weather_zone_id"]
            isOneToOne: false
            referencedRelation: "weather_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_zones: {
        Row: {
          center_lat: number
          center_lon: number
          created_at: string
          grid_x: number
          grid_y: number
          id: number
        }
        Insert: {
          center_lat: number
          center_lon: number
          created_at?: string
          grid_x: number
          grid_y: number
          id?: never
        }
        Update: {
          center_lat?: number
          center_lon?: number
          created_at?: string
          grid_x?: number
          grid_y?: number
          id?: never
        }
        Relationships: []
      }
      weekly_challenges: {
        Row: {
          badge_key: string
          bonus_points: number
          end_date: string
          id: number
          species_id: number
          start_date: string
          week_number: number
          year: number
        }
        Insert: {
          badge_key: string
          bonus_points?: number
          end_date: string
          id?: never
          species_id: number
          start_date: string
          week_number: number
          year: number
        }
        Update: {
          badge_key?: string
          bonus_points?: number
          end_date?: string
          id?: never
          species_id?: number
          start_date?: string
          week_number?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_challenges_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_moisture_layer: {
        Args: {
          p_limit?: number
          p_max_lat: number
          p_max_lon: number
          p_min_lat: number
          p_min_lon: number
          p_obs_date?: string
        }
        Returns: {
          lat: number
          lon: number
          moisture_score: number
          obs_date: string
          precip_10d_sum: number
          precip_7d_sum: number
          temp_mean: number
        }[]
      }
      get_or_create_profile: {
        Args: never
        Returns: {
          avatar_url: string | null
          created_at: string
          display_name: string
          is_premium: boolean
          level: number
          total_points: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_predictions: {
        Args: {
          p_limit?: number
          p_max_lat: number
          p_max_lon: number
          p_min_lat: number
          p_min_lon: number
          p_min_score?: number
          p_obs_date?: string
          p_species_id: number
        }
        Returns: {
          lat: number
          lon: number
          obs_date: string
          score_forest: number
          score_soil: number
          score_total: number
          score_weather: number
        }[]
      }
      log_species_discovery: {
        Args: {
          p_ai_confidence: number
          p_image_url: string
          p_notes?: string
          p_quantity?: string
          p_species_id: number
          p_weather_zone_id: number
        }
        Returns: {
          badge_title: string
          badge_unlocked: string
          discovery_id: number
          new_total_points: number
          points_awarded: number
        }[]
      }
      lookup_weather_zone: {
        Args: { p_lat: number; p_lon: number }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
