CREATE TABLE cms_text_page (
  store_id UUID NOT NULL REFERENCES store(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  page_code VARCHAR(16) NOT NULL CHECK (page_code IN ('STORY','TERMS','PRIVACY')),
  title VARCHAR(80) NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) <= 12000),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  published_version INTEGER CHECK (published_version > 0 AND published_version <= version),
  PRIMARY KEY(store_id,page_code)
);
CREATE TABLE cms_text_revision (
  store_id UUID NOT NULL,
  page_code VARCHAR(16) NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  title VARCHAR(80) NOT NULL CHECK (char_length(btrim(title)) > 0),
  body TEXT NOT NULL CHECK (char_length(btrim(body,E' \t\r\n')) BETWEEN 1 AND 12000),
  published_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_version INTEGER CHECK (source_version > 0 AND source_version < version),
  PRIMARY KEY(store_id,page_code,version),
  FOREIGN KEY(store_id,page_code) REFERENCES cms_text_page(store_id,page_code) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY(store_id,page_code,source_version) REFERENCES cms_text_revision(store_id,page_code,version) ON DELETE RESTRICT
);
ALTER TABLE cms_text_page ADD CONSTRAINT cms_text_page_publication_fk
  FOREIGN KEY(store_id,page_code,published_version) REFERENCES cms_text_revision(store_id,page_code,version) DEFERRABLE INITIALLY DEFERRED;
-- No store, account or effective story/legal/privacy text is seeded.
