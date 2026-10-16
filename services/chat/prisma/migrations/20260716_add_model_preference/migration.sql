-- Migration: add_model_preference
-- Adds an optional modelPreference column to chat_sessions.
-- This stores the user's chosen Claude model for the session.

ALTER TABLE "chat_sessions" ADD COLUMN "modelPreference" TEXT;
