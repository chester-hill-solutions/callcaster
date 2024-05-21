export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audience: {
        Row: {
          created_at: string
          id: number
          name: string | null
          workspace: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          name?: string | null
          workspace?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          name?: string | null
          workspace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audience_workspace_fkey"
            columns: ["workspace"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      call: {
        Row: {
          account_sid: string | null
          answered_by: Database["public"]["Enums"]["answered_by"] | null
          answers: Json | null
          api_version: string | null
          call_duration: number | null
          caller_name: string | null
          campaign_id: number | null
          contact_id: number | null
          date_created: string
          date_updated: string | null
          direction: string | null
          duration: string | null
          end_time: string | null
          forwarded_from: string | null
          from: string | null
          from_formatted: string | null
          group_sid: string | null
          parent_call_sid: string | null
          phone_number_sid: string | null
          price: string | null
          price_unit: string | null
          queue_time: string | null
          recording_duration: string | null
          recording_sid: string | null
          recording_url: string | null
          sid: string
          start_time: string | null
          status: Database["public"]["Enums"]["call_status"] | null
          subresource_uris: Json | null
          to: string | null
          to_formatted: string | null
          trunk_sid: string | null
          uri: string | null
          workspace: string | null
        }
        Insert: {
          account_sid?: string | null
          answered_by?: Database["public"]["Enums"]["answered_by"] | null
          answers?: Json | null
          api_version?: string | null
          call_duration?: number | null
          caller_name?: string | null
          campaign_id?: number | null
          contact_id?: number | null
          date_created?: string
          date_updated?: string | null
          direction?: string | null
          duration?: string | null
          end_time?: string | null
          forwarded_from?: string | null
          from?: string | null
          from_formatted?: string | null
          group_sid?: string | null
          parent_call_sid?: string | null
          phone_number_sid?: string | null
          price?: string | null
          price_unit?: string | null
          queue_time?: string | null
          recording_duration?: string | null
          recording_sid?: string | null
          recording_url?: string | null
          sid: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["call_status"] | null
          subresource_uris?: Json | null
          to?: string | null
          to_formatted?: string | null
          trunk_sid?: string | null
          uri?: string | null
          workspace?: string | null
        }
        Update: {
          account_sid?: string | null
          answered_by?: Database["public"]["Enums"]["answered_by"] | null
          answers?: Json | null
          api_version?: string | null
          call_duration?: number | null
          caller_name?: string | null
          campaign_id?: number | null
          contact_id?: number | null
          date_created?: string
          date_updated?: string | null
          direction?: string | null
          duration?: string | null
          end_time?: string | null
          forwarded_from?: string | null
          from?: string | null
          from_formatted?: string | null
          group_sid?: string | null
          parent_call_sid?: string | null
          phone_number_sid?: string | null
          price?: string | null
          price_unit?: string | null
          queue_time?: string | null
          recording_duration?: string | null
          recording_sid?: string | null
          recording_url?: string | null
          sid?: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["call_status"] | null
          subresource_uris?: Json | null
          to?: string | null
          to_formatted?: string | null
          trunk_sid?: string | null
          uri?: string | null
          workspace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_parent_call_sid_fkey"
            columns: ["parent_call_sid"]
            isOneToOne: false
            referencedRelation: "call"
            referencedColumns: ["sid"]
          },
          {
            foreignKeyName: "call_workspace_fkey"
            columns: ["workspace"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign: {
        Row: {
          call_questions: Json | null
          created_at: string
          end_date: string | null
          id: number
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"] | null
          title: string | null
          type: Database["public"]["Enums"]["campaign_type"] | null
          voicemail_file: string | null
          workspace: string | null
        }
        Insert: {
          call_questions?: Json | null
          created_at?: string
          end_date?: string | null
          id?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"] | null
          title?: string | null
          type?: Database["public"]["Enums"]["campaign_type"] | null
          voicemail_file?: string | null
          workspace?: string | null
        }
        Update: {
          call_questions?: Json | null
          created_at?: string
          end_date?: string | null
          id?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"] | null
          title?: string | null
          type?: Database["public"]["Enums"]["campaign_type"] | null
          voicemail_file?: string | null
          workspace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_workspace_fkey"
            columns: ["workspace"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_audience: {
        Row: {
          audience_id: number
          campaign_id: number
          created_at: string
        }
        Insert: {
          audience_id: number
          campaign_id?: number
          created_at?: string
        }
        Update: {
          audience_id?: number
          campaign_id?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_audiences_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "audience"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_audiences_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
        ]
      }
      contact: {
        Row: {
          address: string | null
          carrier: string | null
          city: string | null
          created_at: string
          email: string | null
          firstname: string | null
          id: number
          opt_out: boolean | null
          phone: string | null
          surname: string | null
          workspace: string | null
        }
        Insert: {
          address?: string | null
          carrier?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          firstname?: string | null
          id?: number
          opt_out?: boolean | null
          phone?: string | null
          surname?: string | null
          workspace?: string | null
        }
        Update: {
          address?: string | null
          carrier?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          firstname?: string | null
          id?: number
          opt_out?: boolean | null
          phone?: string | null
          surname?: string | null
          workspace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_workspace_fkey"
            columns: ["workspace"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_audience: {
        Row: {
          audience_id: number
          contact_id: number
          created_at: string
        }
        Insert: {
          audience_id: number
          contact_id?: number
          created_at?: string
        }
        Update: {
          audience_id?: number
          contact_id?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_audiences_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "audience"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_audiences_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
        ]
      }
      live_campaign: {
        Row: {
          campaign_id: number | null
          id: number
          questions: Json | null
          voicemail: string | null
        }
        Insert: {
          campaign_id?: number | null
          id?: number
          questions?: Json | null
          voicemail?: string | null
        }
        Update: {
          campaign_id?: number | null
          id?: number
          questions?: Json | null
          voicemail?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_campaign_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
        ]
      }
      message: {
        Row: {
          account_sid: string | null
          api_version: string | null
          body: string | null
          campaign_id: number | null
          date_created: string | null
          date_sent: string | null
          date_updated: string | null
          direction: Database["public"]["Enums"]["message_direction"] | null
          error_code: number | null
          error_message: string | null
          from: string | null
          messaging_service_sid: string | null
          num_media: string | null
          num_segments: string | null
          price: string
          price_unit: string | null
          sid: number
          status: Database["public"]["Enums"]["message_status"] | null
          subresource_uris: Json | null
          to: string | null
          uri: string | null
          workspace: string | null
        }
        Insert: {
          account_sid?: string | null
          api_version?: string | null
          body?: string | null
          campaign_id?: number | null
          date_created?: string | null
          date_sent?: string | null
          date_updated?: string | null
          direction?: Database["public"]["Enums"]["message_direction"] | null
          error_code?: number | null
          error_message?: string | null
          from?: string | null
          messaging_service_sid?: string | null
          num_media?: string | null
          num_segments?: string | null
          price: string
          price_unit?: string | null
          sid?: number
          status?: Database["public"]["Enums"]["message_status"] | null
          subresource_uris?: Json | null
          to?: string | null
          uri?: string | null
          workspace?: string | null
        }
        Update: {
          account_sid?: string | null
          api_version?: string | null
          body?: string | null
          campaign_id?: number | null
          date_created?: string | null
          date_sent?: string | null
          date_updated?: string | null
          direction?: Database["public"]["Enums"]["message_direction"] | null
          error_code?: number | null
          error_message?: string | null
          from?: string | null
          messaging_service_sid?: string | null
          num_media?: string | null
          num_segments?: string | null
          price?: string
          price_unit?: string | null
          sid?: number
          status?: Database["public"]["Enums"]["message_status"] | null
          subresource_uris?: Json | null
          to?: string | null
          uri?: string | null
          workspace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_workspace_fkey"
            columns: ["workspace"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
        ]
      }
      message_campaign: {
        Row: {
          body: string | null
          campaign_id: number | null
          created_at: string
          id: number
          media_url: string[] | null
        }
        Insert: {
          body?: string | null
          campaign_id?: number | null
          created_at?: string
          id?: number
          media_url?: string[] | null
        }
        Update: {
          body?: string | null
          campaign_id?: number | null
          created_at?: string
          id?: number
          media_url?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "message_campaign_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
        ]
      }
      robo_campaign: {
        Row: {
          campaign_id: number | null
          created_at: string
          id: number
          media_url: string | null
        }
        Insert: {
          campaign_id?: number | null
          created_at?: string
          id?: number
          media_url?: string | null
        }
        Update: {
          campaign_id?: number | null
          created_at?: string
          id?: number
          media_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "robo_campaign_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
        ]
      }
      user: {
        Row: {
          access_level: string | null
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          organization: number | null
          username: string
        }
        Insert: {
          access_level?: string | null
          created_at?: string
          first_name?: string | null
          id: string
          last_name?: string | null
          organization?: number | null
          username?: string
        }
        Update: {
          access_level?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          organization?: number | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace: {
        Row: {
          created_at: string
          id: string
          name: string
          owner: string | null
          users: string[] | null
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          owner?: string | null
          users?: string[] | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner?: string | null
          users?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_owner_fkey"
            columns: ["owner"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_audiences_by_campaign: {
        Args: {
          selected_campaign_id: number
        }
        Returns: {
          created_at: string
          id: number
          name: string | null
          workspace: string | null
        }[]
      }
      get_calls_by_campaign: {
        Args: {
          selected_campaign_id: number
        }
        Returns: {
          account_sid: string | null
          answered_by: Database["public"]["Enums"]["answered_by"] | null
          answers: Json | null
          api_version: string | null
          call_duration: number | null
          caller_name: string | null
          campaign_id: number | null
          contact_id: number | null
          date_created: string
          date_updated: string | null
          direction: string | null
          duration: string | null
          end_time: string | null
          forwarded_from: string | null
          from: string | null
          from_formatted: string | null
          group_sid: string | null
          parent_call_sid: string | null
          phone_number_sid: string | null
          price: string | null
          price_unit: string | null
          queue_time: string | null
          recording_duration: string | null
          recording_sid: string | null
          recording_url: string | null
          sid: string
          start_time: string | null
          status: Database["public"]["Enums"]["call_status"] | null
          subresource_uris: Json | null
          to: string | null
          to_formatted: string | null
          trunk_sid: string | null
          uri: string | null
          workspace: string | null
        }[]
      }
      get_contacts_by_campaign: {
        Args: {
          selected_campaign_id: number
        }
        Returns: {
          address: string | null
          carrier: string | null
          city: string | null
          created_at: string
          email: string | null
          firstname: string | null
          id: number
          opt_out: boolean | null
          phone: string | null
          surname: string | null
          workspace: string | null
        }[]
      }
    }
    Enums: {
      answered_by: "human" | "machine"
      call_status:
        | "queued"
        | "ringing"
        | "in-progress"
        | "canceled"
        | "completed"
        | "failed"
        | "busy"
        | "no-answer"
        | "initiated"
      campaign_status: "pending" | "running" | "complete" | "paused"
      campaign_type:
        | "message"
        | "robocall"
        | "simple_ivr"
        | "complex_ivr"
        | "live_call"
      message_direction:
        | "inbound"
        | "outbound-api"
        | "outbound-call"
        | "outbound-reply"
      message_status:
        | "accepted"
        | "scheduled"
        | "canceled"
        | "queued"
        | "sending"
        | "sent"
        | "failed"
        | "delivered"
        | "undelivered"
        | "receiving"
        | "received"
        | "read"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never
