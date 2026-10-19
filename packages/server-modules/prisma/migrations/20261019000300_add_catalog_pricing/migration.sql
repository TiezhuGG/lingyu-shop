CREATE TABLE catalog_category (
  id UUID PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES store(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  name VARCHAR(80) NOT NULL CHECK (char_length(btrim(name)) > 0),
  sort INTEGER NOT NULL CHECK (sort BETWEEN 0 AND 9999),
  active BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (store_id, name)
);
CREATE TABLE catalog_product (
  id UUID PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES store(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  category_id UUID NOT NULL REFERENCES catalog_category(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  name VARCHAR(80) NOT NULL CHECK (char_length(btrim(name)) > 0),
  description VARCHAR(1000) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  published_version INTEGER CHECK (published_version > 0 AND published_version <= version)
);
CREATE INDEX catalog_product_store_id_id_idx ON catalog_product(store_id, id);
CREATE TABLE catalog_sku (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES catalog_product(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  code VARCHAR(48) NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{2,47}$'),
  unit VARCHAR(8) NOT NULL CHECK (unit IN ('PIECE', 'PACK', 'BOX', 'BOTTLE', 'BAG')),
  options JSONB NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) <= 3),
  options_key VARCHAR(1200) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(product_id, options_key),
  UNIQUE(product_id, id)
);
CREATE TABLE catalog_publication (
  product_id UUID NOT NULL REFERENCES catalog_product(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  name VARCHAR(80) NOT NULL CHECK (char_length(btrim(name)) > 0),
  description VARCHAR(1000) NOT NULL,
  category_id UUID NOT NULL REFERENCES catalog_category(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  category_name VARCHAR(80) NOT NULL,
  category_sort INTEGER NOT NULL CHECK (category_sort BETWEEN 0 AND 9999),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(product_id, version)
);
ALTER TABLE catalog_product ADD CONSTRAINT catalog_product_publication_fk
  FOREIGN KEY(id, published_version) REFERENCES catalog_publication(product_id, version) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE catalog_published_sku (
  product_id UUID NOT NULL,
  version INTEGER NOT NULL,
  sku_id UUID NOT NULL REFERENCES catalog_sku(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  PRIMARY KEY(product_id, version, sku_id),
  FOREIGN KEY(product_id, version) REFERENCES catalog_publication(product_id, version) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY(product_id, sku_id) REFERENCES catalog_sku(product_id, id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE sku_price_draft (
  sku_id UUID PRIMARY KEY REFERENCES catalog_sku(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  price_minor BIGINT CHECK (price_minor BETWEEN 0 AND 999999999999)
);
CREATE TABLE sku_price_version (
  product_id UUID NOT NULL,
  version INTEGER NOT NULL,
  sku_id UUID NOT NULL REFERENCES catalog_sku(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  price_minor BIGINT NOT NULL CHECK (price_minor BETWEEN 0 AND 999999999999),
  PRIMARY KEY(product_id, version, sku_id),
  FOREIGN KEY(product_id, version) REFERENCES catalog_publication(product_id, version) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY(product_id, version, sku_id) REFERENCES catalog_published_sku(product_id, version, sku_id) ON DELETE RESTRICT ON UPDATE CASCADE
);
-- No seeds, prices, physical stock or enabled fulfillment rules.
