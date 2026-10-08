export type FileKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "document"
  | "spreadsheet"
  | "slides"
  | "archive"
  | "code"
  | "text"
  | "design"
  | "font"
  | "app"
  | "other";

const BY_EXT: Record<string, FileKind> = {};
const add = (kind: FileKind, list: string) => {
  for (const ext of list.split(" ")) BY_EXT[ext] = kind;
};
add("image", "jpg jpeg png gif webp heic heif avif bmp tiff tif svg ico raw cr2 nef arw dng");
add("video", "mp4 mov mkv avi webm m4v wmv flv mpg mpeg 3gp mts");
add("audio", "mp3 wav m4a aac flac ogg opus aiff wma mid midi");
add("pdf", "pdf");
add("document", "doc docx odt rtf pages epub mobi");
add("spreadsheet", "xls xlsx csv tsv ods numbers");
add("slides", "ppt pptx odp key");
add("archive", "zip rar 7z tar gz tgz bz2 xz iso");
add("code", "js ts tsx jsx json html css py rb go rs java kt swift c cpp h cs php sh sql yml yaml toml xml ipynb");
add("text", "txt md log");
add("design", "psd ai fig sketch xd indd blend obj stl");
add("font", "ttf otf woff woff2");
add("app", "apk ipa dmg exe msi pkg deb rpm appimage");

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  const ext = name.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

export function kindOf(name: string, mime = ""): FileKind {
  const known = BY_EXT[extensionOf(name)];
  if (known) return known;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("text/")) return "text";
  if (mime === "application/pdf") return "pdf";
  return "other";
}

export function sizeBucket(bytes: number): string {
  if (bytes < 1_000_000) return "under 1 MB";
  if (bytes < 10_000_000) return "1 to 10 MB";
  if (bytes < 100_000_000) return "10 to 100 MB";
  if (bytes < 1_000_000_000) return "100 MB to 1 GB";
  if (bytes < 10_000_000_000) return "1 to 10 GB";
  return "over 10 GB";
}
