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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          created_at: string
          created_by: string
          id: string
          message: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          message: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          message?: string
        }
        Relationships: []
      }
      avatar_frame_access: {
        Row: {
          frame: string
          user_id: string
        }
        Insert: {
          frame: string
          user_id: string
        }
        Update: {
          frame?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_frame_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_frame_fits: {
        Row: {
          fit: number
          frame: string
          offset_x: number
          offset_y: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          fit: number
          frame: string
          offset_x?: number
          offset_y?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          fit?: number
          frame?: string
          offset_x?: number
          offset_y?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      avatar_frames: {
        Row: {
          frame: string
          frame_key: string | null
          user_id: string
        }
        Insert: {
          frame: string
          frame_key?: string | null
          user_id: string
        }
        Update: {
          frame?: string
          frame_key?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_frames_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coin_wallets: {
        Row: {
          balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coin_wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_avatar_frames: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          id: string
          image_path: string
          name: string
          public_access: boolean
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          id: string
          image_path: string
          name: string
          public_access?: boolean
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          id?: string
          image_path?: string
          name?: string
          public_access?: boolean
        }
        Relationships: []
      }
      discord_links: {
        Row: {
          discord_id: string
          discord_username: string
          linked_at: string
          user_id: string
        }
        Insert: {
          discord_id: string
          discord_username: string
          linked_at?: string
          user_id: string
        }
        Update: {
          discord_id?: string
          discord_username?: string
          linked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discord_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discord_queue_interactions: {
        Row: {
          created_at: string
          interaction_id: string
          result: string
        }
        Insert: {
          created_at?: string
          interaction_id: string
          result: string
        }
        Update: {
          created_at?: string
          interaction_id?: string
          result?: string
        }
        Relationships: []
      }
      emblems: {
        Row: {
          created_at: string
          created_by: string
          id: string
          image_path: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          image_path: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          image_path?: string
          name?: string
        }
        Relationships: []
      }
      league_event_results: {
        Row: {
          event_id: string
          games: number
          losses: number
          mmr_gain: number
          place: number | null
          qualified: boolean
          user_id: string
          wins: number
        }
        Insert: {
          event_id: string
          games: number
          losses: number
          mmr_gain: number
          place?: number | null
          qualified: boolean
          user_id: string
          wins: number
        }
        Update: {
          event_id?: string
          games?: number
          losses?: number
          mmr_gain?: number
          place?: number | null
          qualified?: boolean
          user_id?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_event_results_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "league_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_event_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      league_events: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string
          finished_at: string | null
          id: string
          min_games: number
          name: string
          starts_at: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at: string
          finished_at?: string | null
          id?: string
          min_games?: number
          name: string
          starts_at: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string
          finished_at?: string | null
          id?: string
          min_games?: number
          name?: string
          starts_at?: string
          status?: string
        }
        Relationships: []
      }
      loss_shield_owners: {
        Row: {
          armed: boolean
          paired_losses: boolean
          pending_loss: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          armed?: boolean
          paired_losses?: boolean
          pending_loss?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          armed?: boolean
          paired_losses?: boolean
          pending_loss?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loss_shield_owners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_kick_ballots: {
        Row: {
          approve: boolean
          user_id: string
          vote_id: string
        }
        Insert: {
          approve: boolean
          user_id: string
          vote_id: string
        }
        Update: {
          approve?: boolean
          user_id?: string
          vote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_kick_ballots_vote_id_fkey"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "match_kick_votes"
            referencedColumns: ["id"]
          },
        ]
      }
      match_kick_votes: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          ends_at: string
          id: string
          match_id: string
          no_count: number | null
          started_at: string
          started_by: string
          status: string
          target_id: string
          yes_count: number | null
        }
        Insert: {
          decided_at?: string | null
          decided_by?: string | null
          ends_at?: string
          id?: string
          match_id: string
          no_count?: number | null
          started_at?: string
          started_by: string
          status?: string
          target_id: string
          yes_count?: number | null
        }
        Update: {
          decided_at?: string | null
          decided_by?: string | null
          ends_at?: string
          id?: string
          match_id?: string
          no_count?: number | null
          started_at?: string
          started_by?: string
          status?: string
          target_id?: string
          yes_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_kick_votes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_player_stats: {
        Row: {
          assists: number
          goals: number
          interceptions: number
          match_id: string
          mvp: boolean
          passes: number
          saves: number
          score: number
          user_id: string
        }
        Insert: {
          assists?: number
          goals?: number
          interceptions?: number
          match_id: string
          mvp?: boolean
          passes?: number
          saves?: number
          score?: number
          user_id: string
        }
        Update: {
          assists?: number
          goals?: number
          interceptions?: number
          match_id?: string
          mvp?: boolean
          passes?: number
          saves?: number
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_player_stats_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_player_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_players: {
        Row: {
          accepted: boolean
          base_delta: number | null
          cancel_vote: boolean
          competitive: boolean
          confirm: boolean | null
          delta: number | null
          match_id: string
          position: string | null
          protection_kind: string | null
          rating_after: number | null
          rating_before: number
          shot_vote: boolean | null
          team: string | null
          trolling_delta: number
          user_id: string
          vote: string | null
        }
        Insert: {
          accepted?: boolean
          base_delta?: number | null
          cancel_vote?: boolean
          competitive?: boolean
          confirm?: boolean | null
          delta?: number | null
          match_id: string
          position?: string | null
          protection_kind?: string | null
          rating_after?: number | null
          rating_before?: number
          shot_vote?: boolean | null
          team?: string | null
          trolling_delta?: number
          user_id: string
          vote?: string | null
        }
        Update: {
          accepted?: boolean
          base_delta?: number | null
          cancel_vote?: boolean
          competitive?: boolean
          confirm?: boolean | null
          delta?: number | null
          match_id?: string
          position?: string | null
          protection_kind?: string | null
          rating_after?: number | null
          rating_before?: number
          shot_vote?: boolean | null
          team?: string | null
          trolling_delta?: number
          user_id?: string
          vote?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_players_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_replacements: {
        Row: {
          created_at: string
          id: string
          match_id: string
          position: string | null
          removed_id: string
          removed_player: Json
          replaced_at: string | null
          replacement_id: string | null
          team: string | null
          was_captain: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          position?: string | null
          removed_id: string
          removed_player: Json
          replaced_at?: string | null
          replacement_id?: string | null
          team?: string | null
          was_captain?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          position?: string | null
          removed_id?: string
          removed_player?: Json
          replaced_at?: string | null
          replacement_id?: string | null
          team?: string | null
          was_captain?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "match_replacements_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_voice: {
        Row: {
          channel_a: string | null
          channel_b: string | null
          cleaned_at: string | null
          created_at: string
          match_id: string
        }
        Insert: {
          channel_a?: string | null
          channel_b?: string | null
          cleaned_at?: string | null
          created_at?: string
          match_id: string
        }
        Update: {
          channel_a?: string | null
          channel_b?: string | null
          cleaned_at?: string | null
          created_at?: string
          match_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_voice_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          average_a: number | null
          average_b: number | null
          captain_a: string | null
          captain_b: string | null
          completed_at: string | null
          created_at: string
          deadline: string | null
          draft_first_team: string
          draft_pool: number
          had_bots: boolean
          id: string
          is_mix: boolean
          mode: number
          region: string
          report_a: number | null
          report_b: number | null
          reported_by: string | null
          room_code: string | null
          score_a: number | null
          score_b: number | null
          shot_approved: boolean
          shot_by: string | null
          shot_path: string | null
          shot_score_a: number | null
          shot_score_b: number | null
          status: string
        }
        Insert: {
          average_a?: number | null
          average_b?: number | null
          captain_a?: string | null
          captain_b?: string | null
          completed_at?: string | null
          created_at?: string
          deadline?: string | null
          draft_first_team?: string
          draft_pool?: number
          had_bots?: boolean
          id?: string
          is_mix?: boolean
          mode: number
          region: string
          report_a?: number | null
          report_b?: number | null
          reported_by?: string | null
          room_code?: string | null
          score_a?: number | null
          score_b?: number | null
          shot_approved?: boolean
          shot_by?: string | null
          shot_path?: string | null
          shot_score_a?: number | null
          shot_score_b?: number | null
          status?: string
        }
        Update: {
          average_a?: number | null
          average_b?: number | null
          captain_a?: string | null
          captain_b?: string | null
          completed_at?: string | null
          created_at?: string
          deadline?: string | null
          draft_first_team?: string
          draft_pool?: number
          had_bots?: boolean
          id?: string
          is_mix?: boolean
          mode?: number
          region?: string
          report_a?: number | null
          report_b?: number | null
          reported_by?: string | null
          room_code?: string | null
          score_a?: number | null
          score_b?: number | null
          shot_approved?: boolean
          shot_by?: string | null
          shot_path?: string | null
          shot_score_a?: number | null
          shot_score_b?: number | null
          status?: string
        }
        Relationships: []
      }
      mix_ranking_exclusions: {
        Row: {
          counts_as: string | null
          created_at: string
          match_id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          counts_as?: string | null
          created_at?: string
          match_id: string
          reason?: string | null
          user_id: string
        }
        Update: {
          counts_as?: string | null
          created_at?: string
          match_id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mix_settings: {
        Row: {
          ends_at: string | null
          id: boolean
          manual_on: boolean
          starts_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ends_at?: string | null
          id?: boolean
          manual_on?: boolean
          starts_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ends_at?: string | null
          id?: boolean
          manual_on?: boolean
          starts_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      mod_actions: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          reason: string | null
          target_match: string | null
          target_user: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          reason?: string | null
          target_match?: string | null
          target_user?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          target_match?: string | null
          target_user?: string | null
        }
        Relationships: []
      }
      name_colors: {
        Row: {
          color1: string
          color2: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          style: string
        }
        Insert: {
          color1: string
          color2?: string | null
          created_at?: string
          created_by?: string | null
          id: string
          name: string
          style: string
        }
        Update: {
          color1?: string
          color2?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          style?: string
        }
        Relationships: []
      }
      name_fonts: {
        Row: {
          created_at: string
          created_by: string | null
          file_path: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_path: string
          id: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_path?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      player_emblems: {
        Row: {
          emblem_id: string
          equipped: boolean
          granted_at: string
          granted_by: string
          season_id: string | null
          user_id: string
        }
        Insert: {
          emblem_id: string
          equipped?: boolean
          granted_at?: string
          granted_by: string
          season_id?: string | null
          user_id: string
        }
        Update: {
          emblem_id?: string
          equipped?: boolean
          granted_at?: string
          granted_by?: string
          season_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_emblems_emblem_id_fkey"
            columns: ["emblem_id"]
            isOneToOne: false
            referencedRelation: "emblems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_emblems_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_emblems_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_fonts: {
        Row: {
          acquired_at: string
          equipped: boolean
          font_id: string
          granted_by: string | null
          user_id: string
        }
        Insert: {
          acquired_at?: string
          equipped?: boolean
          font_id: string
          granted_by?: string | null
          user_id: string
        }
        Update: {
          acquired_at?: string
          equipped?: boolean
          font_id?: string
          granted_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_fonts_font_id_fkey"
            columns: ["font_id"]
            isOneToOne: false
            referencedRelation: "name_fonts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_fonts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_likes: {
        Row: {
          created_at: string
          giver_id: string
          match_id: string
          target_id: string
        }
        Insert: {
          created_at?: string
          giver_id: string
          match_id: string
          target_id: string
        }
        Update: {
          created_at?: string
          giver_id?: string
          match_id?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_likes_giver_id_fkey"
            columns: ["giver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_likes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_likes_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_name_colors: {
        Row: {
          acquired_at: string
          color_id: string
          equipped: boolean
          granted_by: string | null
          user_id: string
        }
        Insert: {
          acquired_at?: string
          color_id: string
          equipped?: boolean
          granted_by?: string | null
          user_id: string
        }
        Update: {
          acquired_at?: string
          color_id?: string
          equipped?: boolean
          granted_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_name_colors_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "name_colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_name_colors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_profile_tags: {
        Row: {
          equipped: boolean
          granted_at: string
          granted_by: string
          season_id: string | null
          tag_id: string
          user_id: string
        }
        Insert: {
          equipped?: boolean
          granted_at?: string
          granted_by: string
          season_id?: string | null
          tag_id: string
          user_id: string
        }
        Update: {
          equipped?: boolean
          granted_at?: string
          granted_by?: string
          season_id?: string | null
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_profile_tags_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_profile_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "profile_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_profile_tags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_report_state: {
        Row: {
          banned_until: string | null
          cycle: number
          eligible_since: string
          strikes: number
          target_id: string
        }
        Insert: {
          banned_until?: string | null
          cycle?: number
          eligible_since?: string
          strikes?: number
          target_id: string
        }
        Update: {
          banned_until?: string | null
          cycle?: number
          eligible_since?: string
          strikes?: number
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_report_state_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_reports: {
        Row: {
          confirmed: boolean
          created_at: string
          cycle: number
          dismissed: boolean
          id: string
          match_id: string
          reason: string
          reporter_id: string
          target_id: string
          verdict: string | null
        }
        Insert: {
          confirmed?: boolean
          created_at?: string
          cycle: number
          dismissed?: boolean
          id?: string
          match_id: string
          reason: string
          reporter_id: string
          target_id: string
          verdict?: string | null
        }
        Update: {
          confirmed?: boolean
          created_at?: string
          cycle?: number
          dismissed?: boolean
          id?: string
          match_id?: string
          reason?: string
          reporter_id?: string
          target_id?: string
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_reports_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_reports_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_video_recipients: {
        Row: {
          user_id: string
          video_id: string
        }
        Insert: {
          user_id: string
          video_id: string
        }
        Update: {
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_video_recipients_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "player_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      player_video_views: {
        Row: {
          user_id: string
          video_id: string
          viewed_at: string
        }
        Insert: {
          user_id: string
          video_id: string
          viewed_at?: string
        }
        Update: {
          user_id?: string
          video_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_video_views_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "player_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      player_videos: {
        Row: {
          active: boolean
          all_players: boolean
          created_at: string
          created_by: string
          id: string
          object_path: string
          title: string
        }
        Insert: {
          active?: boolean
          all_players?: boolean
          created_at?: string
          created_by: string
          id?: string
          object_path: string
          title: string
        }
        Update: {
          active?: boolean
          all_players?: boolean
          created_at?: string
          created_by?: string
          id?: string
          object_path?: string
          title?: string
        }
        Relationships: []
      }
      point_protection_events: {
        Row: {
          category: string | null
          created_at: string
          event: string
          event_key: string
          id: string
          match_id: string | null
          points: number
          stock_change: number
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          event: string
          event_key: string
          id?: string
          match_id?: string | null
          points?: number
          stock_change?: number
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          event?: string
          event_key?: string
          id?: string
          match_id?: string | null
          points?: number
          stock_change?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "point_protection_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_protection_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      point_protection_wallets: {
        Row: {
          daily_available: boolean
          daily_next_at: string
          highest_tier: number
          rank_stock: number
          user_id: string
        }
        Insert: {
          daily_available?: boolean
          daily_next_at?: string
          highest_tier?: number
          rank_stock?: number
          user_id: string
        }
        Update: {
          daily_available?: boolean
          daily_next_at?: string
          highest_tier?: number
          rank_stock?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "point_protection_wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prize_events: {
        Row: {
          created_at: string
          created_by: string
          first_amount: number
          id: string
          name: string
          second_amount: number
          third_amount: number
        }
        Insert: {
          created_at?: string
          created_by: string
          first_amount?: number
          id?: string
          name: string
          second_amount?: number
          third_amount?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          first_amount?: number
          id?: string
          name?: string
          second_amount?: number
          third_amount?: number
        }
        Relationships: []
      }
      prize_payouts: {
        Row: {
          amount: number
          event_id: string | null
          event_name: string | null
          id: string
          note: string | null
          paid_at: string
          paid_by: string
          place: number
          rating: number
          user_id: string
        }
        Insert: {
          amount: number
          event_id?: string | null
          event_name?: string | null
          id?: string
          note?: string | null
          paid_at?: string
          paid_by: string
          place: number
          rating: number
          user_id: string
        }
        Update: {
          amount?: number
          event_id?: string | null
          event_name?: string | null
          id?: string
          note?: string | null
          paid_at?: string
          paid_by?: string
          place?: number
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prize_payouts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "prize_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prize_payouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_tags: {
        Row: {
          background_color: string
          created_at: string
          created_by: string
          effect: string
          id: string
          name: string
          text_color: string
        }
        Insert: {
          background_color: string
          created_at?: string
          created_by: string
          effect?: string
          id?: string
          name: string
          text_color: string
        }
        Update: {
          background_color?: string
          created_at?: string
          created_by?: string
          effect?: string
          id?: string
          name?: string
          text_color?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          ban_reason: string | null
          banned_until: string | null
          banner_url: string | null
          best_win_streak: number
          created_at: string
          id: string
          is_ghost: boolean
          losses: number
          name: string
          primary_position: string | null
          rating: number
          secondary_position: string | null
          win_streak: number
          wins: number
        }
        Insert: {
          avatar_url?: string | null
          ban_reason?: string | null
          banned_until?: string | null
          banner_url?: string | null
          best_win_streak?: number
          created_at?: string
          id: string
          is_ghost?: boolean
          losses?: number
          name: string
          primary_position?: string | null
          rating?: number
          secondary_position?: string | null
          win_streak?: number
          wins?: number
        }
        Update: {
          avatar_url?: string | null
          ban_reason?: string | null
          banned_until?: string | null
          banner_url?: string | null
          best_win_streak?: number
          created_at?: string
          id?: string
          is_ghost?: boolean
          losses?: number
          name?: string
          primary_position?: string | null
          rating?: number
          secondary_position?: string | null
          win_streak?: number
          wins?: number
        }
        Relationships: []
      }
      promo_items: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          in_rotation: boolean
          kind: string
          link_url: string | null
          media_path: string | null
          sort: number
          title: string
          video_repeats: number
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          in_rotation?: boolean
          kind: string
          link_url?: string | null
          media_path?: string | null
          sort?: number
          title?: string
          video_repeats?: number
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          in_rotation?: boolean
          kind?: string
          link_url?: string | null
          media_path?: string | null
          sort?: number
          title?: string
          video_repeats?: number
        }
        Relationships: []
      }
      promo_settings: {
        Row: {
          enabled: boolean
          id: boolean
          interval_seconds: number
          size_percent: number
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          id?: boolean
          interval_seconds?: number
          size_percent?: number
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          id?: boolean
          interval_seconds?: number
          size_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      queue: {
        Row: {
          id: string
          joined_at: string
          last_seen: string
          mode: number
          position: string | null
          region: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          last_seen?: string
          mode: number
          position?: string | null
          region: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          last_seen?: string
          mode?: number
          position?: string | null
          region?: string
          user_id?: string
        }
        Relationships: []
      }
      queue_chat_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          match_id: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          match_id?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          match_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_chat_messages_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rank_history: {
        Row: {
          created_at: string
          from_rank: string
          id: string
          kind: string
          match_id: string | null
          rating: number
          to_rank: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_rank: string
          id?: string
          kind: string
          match_id?: string | null
          rating: number
          to_rank: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_rank?: string
          id?: string
          kind?: string
          match_id?: string | null
          rating?: number
          to_rank?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rank_history_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rank_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rating_history: {
        Row: {
          created_at: string
          elo_delta: number
          id: string
          match_id: string | null
          protection_delta: number
          rating_after: number
          rating_before: number
          streak_bonus: number
          total_delta: number
          trolling_delta: number
          user_id: string
          win_streak: number | null
        }
        Insert: {
          created_at?: string
          elo_delta?: number
          id?: string
          match_id?: string | null
          protection_delta?: number
          rating_after: number
          rating_before: number
          streak_bonus?: number
          total_delta: number
          trolling_delta?: number
          user_id: string
          win_streak?: number | null
        }
        Update: {
          created_at?: string
          elo_delta?: number
          id?: string
          match_id?: string | null
          protection_delta?: number
          rating_after?: number
          rating_before?: number
          streak_bonus?: number
          total_delta?: number
          trolling_delta?: number
          user_id?: string
          win_streak?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rating_history_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      season_baselines: {
        Row: {
          losses: number
          season_id: string
          user_id: string
          wins: number
        }
        Insert: {
          losses: number
          season_id: string
          user_id: string
          wins: number
        }
        Update: {
          losses?: number
          season_id?: string
          user_id?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "season_baselines_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_baselines_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      season_player_stats: {
        Row: {
          assists: number
          final_rank: number | null
          final_rating: number
          gk_games: number
          gk_saves: number
          goals: number
          interceptions: number
          likes: number
          losses: number
          mvps: number
          passes: number
          season_id: string
          user_id: string
          wins: number
        }
        Insert: {
          assists?: number
          final_rank?: number | null
          final_rating: number
          gk_games?: number
          gk_saves?: number
          goals?: number
          interceptions?: number
          likes?: number
          losses?: number
          mvps?: number
          passes?: number
          season_id: string
          user_id: string
          wins?: number
        }
        Update: {
          assists?: number
          final_rank?: number | null
          final_rating?: number
          gk_games?: number
          gk_saves?: number
          goals?: number
          interceptions?: number
          likes?: number
          losses?: number
          mvps?: number
          passes?: number
          season_id?: string
          user_id?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "season_player_stats_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_player_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          created_by: string | null
          finished_at: string | null
          id: string
          name: string
          number: number
          planned_end: string | null
          planned_start: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          name: string
          number: number
          planned_end?: string | null
          planned_start?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          name?: string
          number?: number
          planned_end?: string | null
          planned_start?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      shop_items: {
        Row: {
          active: boolean
          id: string
          kind: string
          name: string
          price: number
          sort: number
        }
        Insert: {
          active?: boolean
          id: string
          kind: string
          name: string
          price: number
          sort?: number
        }
        Update: {
          active?: boolean
          id?: string
          kind?: string
          name?: string
          price?: number
          sort?: number
        }
        Relationships: []
      }
      shop_purchases: {
        Row: {
          created_at: string
          item_id: string
          price: number
          user_id: string
        }
        Insert: {
          created_at?: string
          item_id: string
          price: number
          user_id: string
        }
        Update: {
          created_at?: string
          item_id?: string
          price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_purchases_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "shop_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_settings: {
        Row: {
          display_limit: number
          id: boolean
        }
        Insert: {
          display_limit?: number
          id?: boolean
        }
        Update: {
          display_limit?: number
          id?: boolean
        }
        Relationships: []
      }
      site_countdowns: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          label: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          label: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          label?: string
        }
        Relationships: []
      }
      user_feature_grants: {
        Row: {
          feature: string
          granted_at: string
          granted_by: string
          user_id: string
        }
        Insert: {
          feature: string
          granted_at?: string
          granted_by: string
          user_id: string
        }
        Update: {
          feature?: string
          granted_at?: string
          granted_by?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_feature_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      win_streak_settings: {
        Row: {
          enabled: boolean
          id: boolean
          max_bonus: number
          max_rewarded_streak: number
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          id?: boolean
          max_bonus?: number
          max_rewarded_streak?: number
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          id?: boolean
          max_bonus?: number
          max_rewarded_streak?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      abandon_match_gk: { Args: never; Returns: boolean }
      activate_point_protection: {
        Args: { p_category: string; p_match: string }
        Returns: boolean
      }
      active_season_id: { Args: never; Returns: string }
      admin_adjust_rating: {
        Args: {
          p_delta: number
          p_reason: string
          p_request: string
          p_user: string
        }
        Returns: number
      }
      admin_adjust_record: {
        Args: {
          p_losses_delta: number
          p_reason: string
          p_request: string
          p_user: string
          p_wins_delta: number
        }
        Returns: Json
      }
      admin_ban: {
        Args: { p_hours: number; p_reason: string; p_user: string }
        Returns: boolean
      }
      admin_cancel_match: {
        Args: { p_match: string; p_reason: string }
        Returns: boolean
      }
      admin_clear_countdown: { Args: never; Returns: undefined }
      admin_close_match_vote: {
        Args: { p_match: string; p_reason: string; p_side: string }
        Returns: boolean
      }
      admin_decide_match_kick_gk: {
        Args: { p_approve: boolean; p_vote: string }
        Returns: string
      }
      admin_delete_emblem: { Args: { p_id: string }; Returns: string }
      admin_delete_league_event: { Args: { p_id: string }; Returns: boolean }
      admin_delete_promo: { Args: { p_id: string }; Returns: string }
      admin_delete_season: { Args: { p_id: string }; Returns: boolean }
      admin_enqueue_test_bots:
        | { Args: { p_position: string; p_users: string[] }; Returns: number }
        | {
            Args: { p_position: string; p_test: boolean; p_users: string[] }
            Returns: number
          }
      admin_finish_league_event: { Args: { p_id: string }; Returns: number }
      admin_finish_season: { Args: { p_id: string }; Returns: number }
      admin_grant_emblem: {
        Args: {
          p_emblem: string
          p_remove: boolean
          p_season: string
          p_users: string[]
        }
        Returns: number
      }
      admin_grant_inventory: {
        Args: {
          p_amount: number
          p_frame: string
          p_kind: string
          p_reason: string
          p_request: string
          p_user: string
        }
        Returns: boolean
      }
      admin_grant_profile_tag: {
        Args: { p_remove?: boolean; p_tag: string; p_users: string[] }
        Returns: number
      }
      admin_grant_profile_tag_season: {
        Args: {
          p_remove: boolean
          p_season: string
          p_tag: string
          p_users: string[]
        }
        Returns: number
      }
      admin_kick_queue: {
        Args: { p_reason: string; p_user: string }
        Returns: boolean
      }
      admin_pending_kicks_gk: { Args: never; Returns: Json }
      admin_publish_frame: {
        Args: {
          p_id: string
          p_name: string
          p_path: string
          p_public: boolean
        }
        Returns: boolean
      }
      admin_publish_shop_frame: {
        Args: { p_id: string; p_name: string; p_path: string; p_price: number }
        Returns: boolean
      }
      admin_publish_video: {
        Args: {
          p_all: boolean
          p_path: string
          p_title: string
          p_users: string[]
        }
        Returns: string
      }
      admin_refresh_inhouse_gk: { Args: never; Returns: Json }
      admin_remove_uploaded_frame: {
        Args: { p_frame: string }
        Returns: boolean
      }
      admin_remove_video: { Args: { p_video: string }; Returns: string }
      admin_resolve_match: {
        Args: { p_a: number; p_b: number; p_match: string; p_reason: string }
        Returns: boolean
      }
      admin_save_emblem: {
        Args: { p_id: string; p_name: string; p_path: string }
        Returns: string
      }
      admin_save_league_event: {
        Args: {
          p_ends: string
          p_id: string
          p_min_games: number
          p_name: string
          p_starts: string
        }
        Returns: string
      }
      admin_save_prize_event: {
        Args: {
          p_first: number
          p_id: string
          p_name: string
          p_second: number
          p_third: number
        }
        Returns: string
      }
      admin_save_profile_tag: {
        Args: {
          p_background: string
          p_effect?: string
          p_id: string
          p_name: string
          p_text: string
        }
        Returns: string
      }
      admin_save_promo: {
        Args: {
          p_body: string
          p_id: string
          p_kind: string
          p_link: string
          p_media_path: string
          p_repeats: number
          p_title: string
        }
        Returns: string
      }
      admin_save_season: {
        Args: {
          p_id: string
          p_name: string
          p_number: number
          p_planned_end: string
          p_planned_start: string
        }
        Returns: string
      }
      admin_save_shop_item: {
        Args: {
          p_active: boolean
          p_id: string
          p_name: string
          p_price: number
          p_sort: number
        }
        Returns: boolean
      }
      admin_set_countdown: {
        Args: { p_ends_at: string; p_label: string }
        Returns: string
      }
      admin_set_feature: {
        Args: { p_feature: string; p_on: boolean; p_user: string }
        Returns: boolean
      }
      admin_set_mix: {
        Args: { p_ends: string; p_manual_on: boolean; p_starts: string }
        Returns: Json
      }
      admin_set_promo_rotation: { Args: { p_ids: string[] }; Returns: number }
      admin_set_promo_settings:
        | { Args: { p_enabled: boolean; p_interval: number }; Returns: boolean }
        | {
            Args: { p_enabled: boolean; p_interval: number; p_size?: number }
            Returns: boolean
          }
      admin_set_role: {
        Args: {
          p_on: boolean
          p_role: Database["public"]["Enums"]["app_role"]
          p_user: string
        }
        Returns: boolean
      }
      admin_set_shop_limit: { Args: { p_limit: number }; Returns: boolean }
      admin_start_season: {
        Args: { p_from_beginning: boolean; p_id: string }
        Returns: boolean
      }
      admin_void_match: {
        Args: { p_match: string; p_reason: string }
        Returns: boolean
      }
      backfill_match_gk: { Args: { p_match: string }; Returns: undefined }
      buy_shop_item: { Args: { p_item: string }; Returns: number }
      can_edit_frame_fits: { Args: never; Returns: boolean }
      can_read_queue_chat: { Args: { p_match: string }; Returns: boolean }
      cast_match_kick_gk: {
        Args: { p_vote: string; p_yes: boolean }
        Returns: boolean
      }
      confirm_result_gk: { Args: { p_ok: boolean }; Returns: string }
      delete_queue_chat_message: { Args: { p_id: string }; Returns: undefined }
      discord_queue_action: {
        Args: {
          p_action: string
          p_discord_id: string
          p_interaction_id: string
          p_position?: string
        }
        Returns: string
      }
      draft_assign: {
        Args: { p_match: string; p_target: string }
        Returns: undefined
      }
      draft_phase: { Args: { p_match: string }; Returns: string }
      draft_pick: { Args: { p_target: string }; Returns: boolean }
      draft_step: { Args: { p_count: number }; Returns: Json }
      draft_target_ok: {
        Args: { p_match: string; p_target: string }
        Returns: boolean
      }
      draft_team: {
        Args: { p_count: number; p_first: string }
        Returns: string
      }
      draft_tick: { Args: { p_match: string }; Returns: undefined }
      draft_tick_gk: { Args: never; Returns: Json }
      draft_turn: { Args: { p_match: string }; Returns: string }
      equip_emblem: { Args: { p_emblem?: string }; Returns: boolean }
      equip_name_color: { Args: { p_color?: string }; Returns: boolean }
      equip_name_font: { Args: { p_font?: string }; Returns: boolean }
      equip_profile_tag: { Args: { p_tag?: string }; Returns: boolean }
      finalize_match_gk: {
        Args: { p_a: number; p_b: number; p_match: string }
        Returns: undefined
      }
      get_admin_control_overview: { Args: never; Returns: Json }
      get_admin_overview: { Args: never; Returns: Json }
      get_admin_player_reports: { Args: never; Returns: Json }
      get_equipped_emblems: { Args: never; Returns: Json }
      get_equipped_fonts: { Args: never; Returns: Json }
      get_equipped_name_colors: { Args: never; Returns: Json }
      get_equipped_profile_tags: { Args: never; Returns: Json }
      get_inhouse_state: { Args: never; Returns: Json }
      get_inhouse_state_gk: { Args: never; Returns: Json }
      get_league_events: { Args: never; Returns: Json }
      get_league_ranking: { Args: { p_event: string }; Returns: Json }
      get_league_stat_leaders: { Args: { p_event: string }; Returns: Json }
      get_match_shot_gk: { Args: { p_match: string }; Returns: Json }
      get_mix_mvp_ranking: { Args: { p_season?: string }; Returns: Json }
      get_mix_ranking: { Args: { p_season?: string }; Returns: Json }
      get_mix_state: { Args: never; Returns: Json }
      get_my_like_matches: { Args: never; Returns: Json }
      get_my_liked_ids: { Args: never; Returns: string[] }
      get_my_match_liked_ids: { Args: { p_match: string }; Returns: string[] }
      get_my_report_matches: { Args: never; Returns: Json }
      get_player_profile: { Args: { p_user: string }; Returns: Json }
      get_player_seasons: { Args: { p_user: string }; Returns: Json }
      get_point_protection_state: { Args: never; Returns: Json }
      get_queue_chat: { Args: { p_match?: string }; Returns: Json }
      get_season_ranking: { Args: { p_season: string }; Returns: Json }
      get_seasons: { Args: never; Returns: Json }
      get_staff_ids: { Args: never; Returns: string[] }
      get_stat_leaders: { Args: { p_season?: string }; Returns: Json }
      get_win_streak_settings: { Args: never; Returns: Json }
      ghost_autopick: { Args: { p_match: string }; Returns: undefined }
      has_feature: {
        Args: { _feature: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      join_queue: {
        Args: { p_mode: number; p_region: string }
        Returns: boolean
      }
      join_queue_gk: { Args: { p_position: string }; Returns: boolean }
      join_test_queue_gk: { Args: { p_position: string }; Returns: boolean }
      kick_match_paused: { Args: { p_match: string }; Returns: boolean }
      league_tally: {
        Args: { p_from: string; p_to: string }
        Returns: {
          games: number
          losses: number
          mmr_gain: number
          user_id: string
          wins: number
        }[]
      }
      league_window: {
        Args: { p_event: string }
        Returns: {
          from_at: string
          to_at: string
        }[]
      }
      leave_queue: { Args: never; Returns: boolean }
      leave_queue_gk: { Args: never; Returns: boolean }
      like_player: {
        Args: { p_match: string; p_target: string }
        Returns: boolean
      }
      lock_competitive_player: { Args: { p_user: string }; Returns: undefined }
      mark_event_prize_paid: {
        Args: {
          p_event: string
          p_note: string
          p_place: number
          p_user: string
        }
        Returns: boolean
      }
      mark_notifications_read: { Args: never; Returns: number }
      mark_prize_paid: {
        Args: {
          p_amount: number
          p_note: string
          p_place: number
          p_user: string
        }
        Returns: boolean
      }
      match_accept: { Args: { p_match_id: string }; Returns: string }
      match_cleanup: { Args: never; Returns: undefined }
      match_decline: { Args: { p_match_id: string }; Returns: string }
      match_report: {
        Args: { p_match_id: string; p_score_a: number; p_score_b: number }
        Returns: boolean
      }
      mix_active: { Args: never; Returns: boolean }
      mix_assign_teams_gk: { Args: { p_match: string }; Returns: undefined }
      notify_user: {
        Args: {
          p_body: string
          p_kind: string
          p_title: string
          p_user: string
        }
        Returns: undefined
      }
      player_like_supporters: { Args: { p_user: string }; Returns: Json }
      player_reputation: { Args: { p_user: string }; Returns: number }
      poll_inhouse_gk: { Args: never; Returns: Json }
      post_announcement: { Args: { p_message: string }; Returns: string }
      purge_finished_bot_matches: { Args: never; Returns: string[] }
      queue_heartbeat_gk: { Args: never; Returns: undefined }
      rank_grant_key: { Args: { p_tier: number }; Returns: string }
      rank_label: { Args: { p_rating: number }; Returns: string }
      rank_step_of: { Args: { p_rating: number }; Returns: number }
      refresh_point_wallet: { Args: { p_user: string }; Returns: undefined }
      rename_profile: { Args: { p_name: string }; Returns: boolean }
      report_ban_hours: { Args: { p_strikes: number }; Returns: number }
      report_result_gk: { Args: { p_a: number; p_b: number }; Returns: string }
      resolve_match_kick_gk: { Args: { p_match: string }; Returns: undefined }
      review_player_report: {
        Args: {
          p_action: string
          p_reason: string
          p_report: string
          p_target: string
        }
        Returns: boolean
      }
      season_bounds: {
        Args: { p_season: string }
        Returns: {
          from_at: string
          to_at: string
        }[]
      }
      season_match_stats: {
        Args: { p_from: string; p_to: string; p_user: string }
        Returns: Json
      }
      season_reset_progress: { Args: never; Returns: number }
      send_queue_chat: {
        Args: { p_body: string; p_match: string }
        Returns: string
      }
      set_admin_avatar_frame: { Args: { p_frame: string }; Returns: boolean }
      set_avatar_frame_fit: {
        Args: {
          p_fit: number
          p_frame: string
          p_offset_x: number
          p_offset_y: number
        }
        Returns: boolean
      }
      set_loss_shield: { Args: { p_armed: boolean }; Returns: boolean }
      set_room_code: { Args: { p_code: string }; Returns: boolean }
      set_screenshot_score_gk: {
        Args: {
          p_match: string
          p_mine: number
          p_path?: string
          p_theirs: number
        }
        Returns: boolean
      }
      set_screenshot_stats_gk: {
        Args: { p_match: string; p_stats: Json }
        Returns: number
      }
      set_win_streak_settings: {
        Args: { p_enabled: boolean; p_max_bonus: number; p_max_streak: number }
        Returns: Json
      }
      shop_add_test_coins: { Args: { p_amount: number }; Returns: number }
      shop_reset_my_test: { Args: never; Returns: boolean }
      staff_delete_font: { Args: { p_id: string }; Returns: string }
      staff_delete_name_color: { Args: { p_id: string }; Returns: boolean }
      staff_grant_font: {
        Args: { p_font: string; p_remove: boolean; p_users: string[] }
        Returns: number
      }
      staff_grant_name_color: {
        Args: { p_color: string; p_remove: boolean; p_users: string[] }
        Returns: number
      }
      staff_save_font: {
        Args: {
          p_active: boolean
          p_id: string
          p_name: string
          p_path: string
          p_price: number
        }
        Returns: string
      }
      staff_save_name_color: {
        Args: {
          p_active: boolean
          p_color1: string
          p_color2: string
          p_id: string
          p_name: string
          p_price: number
          p_style: string
        }
        Returns: string
      }
      start_match_kick_gk: {
        Args: { p_match: string; p_target: string }
        Returns: string
      }
      submit_player_report: {
        Args: { p_match: string; p_reason: string; p_target: string }
        Returns: Json
      }
      try_matchmake: { Args: never; Returns: undefined }
      try_matchmake_gk: { Args: never; Returns: undefined }
      try_matchmake_pool_gk: { Args: { p_test: boolean }; Returns: undefined }
      valid_avatar_frame: { Args: { p_frame: string }; Returns: boolean }
      video_object_absent: { Args: { p_path: string }; Returns: boolean }
      vote_cancel_match_gk: { Args: never; Returns: string }
      vote_match: { Args: { p_side: string }; Returns: string }
      vote_result_gk: { Args: { p_side: string }; Returns: string }
      vote_screenshot_gk: {
        Args: { p_match: string; p_ok: boolean }
        Returns: string
      }
      vote_winner_gk: { Args: { p_a: number; p_b: number }; Returns: string }
      withdraw_match_vote_gk: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "player"
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
      app_role: ["admin", "moderator", "player"],
    },
  },
} as const
