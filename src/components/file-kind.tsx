import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Package,
  Presentation,
  type LucideIcon,
} from "lucide-react";

type Kind = { label: string; icon: LucideIcon; tile: string };

const kinds: Record<string, Kind> = {
  image: { label: "Image", icon: FileImage, tile: "bg-pink text-magenta" },
  video: { label: "Video", icon: FileVideo, tile: "bg-lilac text-sea-deep" },
  audio: { label: "Audio", icon: FileAudio, tile: "bg-peach text-orange" },
  pdf: { label: "PDF", icon: FileText, tile: "bg-[#ffd9d6] text-flag-red" },
  doc: { label: "Document", icon: FileText, tile: "bg-[#d9e4ff] text-blue" },
  sheet: { label: "Spreadsheet", icon: FileSpreadsheet, tile: "bg-mint text-forest" },
  slides: { label: "Presentation", icon: Presentation, tile: "bg-peach text-orange" },
  archive: { label: "Archive", icon: FileArchive, tile: "bg-[#ffe9a8] text-[#7a5400]" },
  code: { label: "Code", icon: FileCode, tile: "bg-[#cdeeed] text-teal" },
  font: { label: "Font", icon: FileType, tile: "bg-lilac text-sea-deep" },
  app: { label: "App", icon: Package, tile: "bg-[#d9e4ff] text-blue" },
  text: { label: "Text", icon: FileText, tile: "bg-sunken text-ink" },
  other: { label: "File", icon: File, tile: "bg-sunken text-ink" },
};

const byExtension: Record<string, keyof typeof kinds> = {};
const groups: [keyof typeof kinds, string][] = [
  ["image", "jpg jpeg png gif webp avif heic heif svg bmp tiff tif raw cr2 nef psd ai fig sketch ico"],
  ["video", "mp4 mov mkv avi webm m4v wmv flv mpg mpeg 3gp"],
  ["audio", "mp3 wav m4a aac flac ogg opus aiff wma mid midi"],
  ["pdf", "pdf"],
  ["doc", "doc docx odt rtf pages epub mobi"],
  ["sheet", "xls xlsx csv tsv ods numbers"],
  ["slides", "ppt pptx key odp"],
  ["archive", "zip rar 7z tar gz tgz bz2 xz iso"],
  ["code", "js jsx ts tsx json html css scss py rb go rs java kt swift c h cpp cs php sh sql yml yaml toml xml ipynb"],
  ["font", "ttf otf woff woff2"],
  ["app", "dmg pkg exe msi apk ipa deb rpm appimage"],
  ["text", "txt md log"],
];
for (const [kind, list] of groups) for (const ext of list.split(" ")) byExtension[ext] = kind;

export function kindOf(name: string, type: string): Kind {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (byExtension[ext]) return kinds[byExtension[ext]];
  if (type.startsWith("image/")) return kinds.image;
  if (type.startsWith("video/")) return kinds.video;
  if (type.startsWith("audio/")) return kinds.audio;
  if (type.startsWith("text/")) return kinds.text;
  if (type === "application/pdf") return kinds.pdf;
  if (/zip|compressed|tar/.test(type)) return kinds.archive;
  return kinds.other;
}

export function FileTile({ name, type, done }: { name: string; type: string; done?: boolean }) {
  const kind = kindOf(name, type);
  const Icon = kind.icon;
  return (
    <span
      className={`relative flex h-10 w-10 flex-none items-center justify-center rounded-[10px] ${kind.tile}`}
      title={kind.label}
    >
      <Icon size={20} aria-hidden />
      <span className="sr-only">{kind.label}</span>
      {done && (
        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-signal text-[9px] font-bold text-on-signal ring-2 ring-paper">
          ✓
        </span>
      )}
    </span>
  );
}
