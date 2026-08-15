CREATE TABLE object_storage_deletion_queue (
  object_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE note_images (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  note_id BIGINT REFERENCES notes (id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_note_images_user_id ON note_images (user_id);
CREATE INDEX idx_note_images_note_id ON note_images (note_id);
CREATE INDEX idx_note_images_unattached ON note_images (created_at)
  WHERE note_id IS NULL;

CREATE OR REPLACE FUNCTION enqueue_note_image_object_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO object_storage_deletion_queue (object_key)
  VALUES (OLD.object_key)
  ON CONFLICT (object_key) DO UPDATE SET
    next_attempt_at = LEAST(object_storage_deletion_queue.next_attempt_at, NOW()),
    updated_at = NOW();
  RETURN OLD;
END;
$$;

CREATE TRIGGER note_images_enqueue_object_deletion
BEFORE DELETE ON note_images
FOR EACH ROW
EXECUTE FUNCTION enqueue_note_image_object_deletion();
