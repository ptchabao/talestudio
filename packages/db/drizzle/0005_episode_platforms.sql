ALTER TABLE "episode" ADD COLUMN "platforms" jsonb DEFAULT '[]'::jsonb NOT NULL;
