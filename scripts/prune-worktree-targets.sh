#!/usr/bin/env bash
set -euo pipefail

MODE="dry-run"
STALE_DAYS=14

usage() {
  cat <<'EOF'
Usage: scripts/prune-worktree-targets.sh [--days N] [--apply]

Par défaut, affiche seulement les target/ admissibles âgés d'au moins 14 jours.
--days N  change le seuil d'inactivité (N >= 1)
--apply   exécute le nettoyage après l'aperçu explicite

Le checkout principal, le worktree courant, les worktrees non enregistrés et
les worktrees où cargo/rustc tourne sont toujours exclus.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)
      MODE="apply"
      shift
      ;;
    --days)
      [[ $# -ge 2 ]] || { echo "--days exige une valeur" >&2; exit 2; }
      STALE_DAYS="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Option inconnue : $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$STALE_DAYS" in
  ''|*[!0-9]*)
    echo "--days doit être un entier >= 1" >&2
    exit 2
    ;;
esac
if [[ "$STALE_DAYS" -lt 1 ]]; then
  echo "--days doit être >= 1" >&2
  exit 2
fi

CURRENT_ROOT="$(git rev-parse --show-toplevel)"
COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
MAIN_ROOT="$(cd "$COMMON_DIR/.." && pwd -P)"

worktree_has_active_rust_build() {
  local root="$1"
  local process_name pid cwd

  for process_name in cargo rustc; do
    while IFS= read -r pid; do
      [[ -n "$pid" ]] || continue
      cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1 || true)"
      case "$cwd" in
        "$root"|"$root"/*) return 0 ;;
      esac
    done < <(pgrep -x "$process_name" 2>/dev/null || true)
  done

  return 1
}

target_has_recent_file() {
  local target="$1"
  find "$target" -type f -mtime "-$STALE_DAYS" -print -quit 2>/dev/null | grep -q .
}

candidate_count=0
cleaned_count=0
candidate_kib=0

echo "Mode=$MODE seuil=${STALE_DAYS}j"
echo "Principal exclu : $MAIN_ROOT"

while IFS= read -r line; do
  [[ "$line" == worktree\ * ]] || continue
  root="${line#worktree }"

  if [[ "$root" == "$MAIN_ROOT" || "$root" == "$CURRENT_ROOT" ]]; then
    continue
  fi
  [[ -d "$root" ]] || continue

  if worktree_has_active_rust_build "$root"; then
    echo "SKIP build actif : $root"
    continue
  fi

  for spec in \
    "src-tauri/target|src-tauri/Cargo.toml" \
    "rust/target|rust/Cargo.toml" \
    "mobile/src-tauri/target|mobile/src-tauri/Cargo.toml"
  do
    IFS='|' read -r target_rel manifest_rel <<<"$spec"
    target="$root/$target_rel"
    manifest="$root/$manifest_rel"

    [[ -d "$target" && -f "$manifest" ]] || continue
    if target_has_recent_file "$target"; then
      echo "SKIP récent : $target"
      continue
    fi

    size_kib="$(du -sk "$target" | awk '{print $1}')"
    size_human="$(du -sh "$target" | awk '{print $1}')"
    if [[ "$size_kib" -eq 0 ]]; then
      echo "SKIP vide : $target"
      continue
    fi
    candidate_count=$((candidate_count + 1))
    candidate_kib=$((candidate_kib + size_kib))

    if [[ "$MODE" == "dry-run" ]]; then
      echo "APERÇU $size_human : $target"
      continue
    fi

    case "$target" in
      "$root/src-tauri/target"|"$root/rust/target"|"$root/mobile/src-tauri/target") ;;
      *)
        echo "Refus du chemin inattendu : $target" >&2
        exit 1
        ;;
    esac

    echo "NETTOYAGE $size_human : $target"
    CARGO_TARGET_DIR="$target" cargo clean --manifest-path "$manifest"
    cleaned_count=$((cleaned_count + 1))
  done
done < <(git worktree list --porcelain)

candidate_gib="$(awk -v kib="$candidate_kib" 'BEGIN { printf "%.2f", kib / 1048576 }')"
if [[ "$MODE" == "dry-run" ]]; then
  echo "Résumé : $candidate_count target(s), environ ${candidate_gib} Gio récupérables."
  echo "Aucune suppression. Pour appliquer : npm run rust:targets:prune -- --apply"
else
  echo "Résumé : $cleaned_count/$candidate_count target(s) nettoyés, environ ${candidate_gib} Gio ciblés."
fi
