// Centralized API endpoints configuration
// This file contains all API endpoints used throughout the application

export const API_ENDPOINTS = {
  // Data Request endpoints
  DATA_REQUESTS: {
    BASE: '/data-requests',
    BY_ID: (id) => `/data-requests/${id}`,
    CREATE: '/data-requests',
    UPDATE: (id) => `/data-requests/${id}`,
  },

  // Elasticsearch endpoints
  // No index is named here - these hit ES's cluster-wide _search, so every
  // active MetadataType/ElasticsearchIndex (api/elasticsearch_sync.py) is
  // searched automatically as soon as it's created in the backend admin,
  // with no frontend change needed. Safe because /dms/es proxies straight
  // to a dedicated Elasticsearch container (see nginx.conf) with nothing
  // else indexed on it.
  ELASTICSEARCH: {
    BASE: import.meta.env.VITE_ES_BASE || '/dms/es',
    USERNAME: import.meta.env.VITE_ES_USERNAME || 'elastic',
    PASSWORD: import.meta.env.VITE_ES_PASSWORD || 'T2NlYW5wb3J0YWwyMDE3',
    METADATA_SEARCH: `/_search`,
    METADATA_SEARCH_WITH_SIZE: (size = 1000) => `/_search?size=${size}`,
    METADATA_SEARCH_PAGINATED: (from = 0, size = 10) => `/_search?from=${from}&size=${size}`,
    // Filter aggregations for getting distinct values
    COUNTRIES_AGGREGATION: `/_search`,
  },

  // PyGeoAPI endpoints
  // One collection per MetadataType (see the migration plan, Phase 9),
  // named identically to its ElasticsearchIndex.index_name - callers should
  // pass a record's own metadataType (from its ES hit's _index, see
  // elasticsearchService.transformElasticsearchResponse) rather than rely
  // on DEFAULT_COLLECTION, which only exists as a last-resort fallback.
  PYGEOAPI: {
    BASE: import.meta.env.VITE_PYGEOAPI_BASE || '/dms/pygeoapi',
    COLLECTIONS: '/collections',
    DEFAULT_COLLECTION: 'lidar',
    METADATA_COLLECTION: (collection = 'lidar') => `/collections/${collection}`,
    METADATA_ITEMS: (collection = 'lidar') => `/collections/${collection}/items`,
    METADATA_ITEM_BY_ID: (id, collection = 'lidar') => `/collections/${collection}/items/${id}`,
  },
}
