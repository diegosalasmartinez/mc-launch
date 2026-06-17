export interface AssetObject {
  /** sha1, also the object's filename and storage key */
  hash: string;
  size: number;
}

export interface AssetIndex {
  objects: Record<string, AssetObject>;
  // legacy layouts mirror objects into assets/virtual/legacy/ by virtual path. not handled (modern only).
  virtual?: boolean;
  map_to_resources?: boolean;
}
