import { FileIcon } from "lucide-react";
import type { Asset } from "@/lib/types";

export function AssetDocument({ asset }: { asset: Asset }) {
  if (!asset.fileName) return null;
  const kb = Math.round((asset.fileSize ?? 0) / 1024);
  const typeLabel = asset.contentType || "application/octet-stream";
  return (
    <div className="asset-document">
      <span className="console-kicker">ATTACHED DOCUMENT</span>
      <div className="file-chip file-ok">
        <FileIcon size={12} />
        <span>
          {asset.fileName}<br />
          <small>{kb} KB · {typeLabel}</small>
        </span>
      </div>
      {asset.storageRef && (
        <div className="asset-file-note">
          <span className="console-kicker">STORE</span>
          <span>Backend storage path: {asset.storageRef}</span>
        </div>
      )}
      {asset.fileHash && (
        <div className="asset-file-note">
          <span className="console-kicker">VERIFICATION</span>
          <span>Local file hash recorded: {asset.fileHash}</span>
        </div>
      )}
    </div>
  );
}
