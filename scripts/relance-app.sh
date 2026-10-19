#!/usr/bin/env bash
# Relance d'Atelier sur le Mac : appelé par docs/PROTOCOLE_RELANCE.md, qui
# reste la seule procédure (quand, qui, quels contrôles avant). Ne pas
# lancer sans l'accord de Thierry.
#
#   bash scripts/relance-app.sh --confirme          construire, arrêter, installer, relancer
#   bash scripts/relance-app.sh --retour --confirme revenir à la build précédente (et inversement)
#   bash scripts/relance-app.sh --etat              builds installées et processus, sans rien arrêter
#
# Toujours lancé par `bash` : sous zsh, le bloc copié-collé d'avant
# plantait (kill -9 $PIDS non découpé dès que deux serveurs galerie
# tournaient). Ici, chaque PID est passé seul à kill.
#
# L'app tourne depuis une COPIE installée (~/Applications/Atelier.app), que
# le build ne touche pas : on construit pendant qu'elle tourne, et un build
# raté n'arrête rien. La build d'avant est gardée dans
# ~/Applications/Atelier-precedente/ pour un retour arrière en un geste.
#
# Codes de sortie : 0 relancée ; 1 arrêt incomplet ou lancement raté ;
# 2 refus (confirmation absente, hors macOS, lancé depuis Atelier) ;
# 3 tour de chat en cours, rien n'est arrêté ; 4 build raté.
set -o pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
INSTALL_ROOT="${ATELIER_INSTALL_ROOT:-$HOME/Applications}"
INSTALL_APP="$INSTALL_ROOT/Atelier.app"
RESERVE_DIR="$INSTALL_ROOT/Atelier-precedente"
STAGING_DIR="$RESERVE_DIR/.nouvelle"
BUILT_APP="$REPO_ROOT/src-tauri/target/release/bundle/macos/Atelier.app"
# Copie installée depuis le DMG : même identifiant de bundle que la copie de
# ~/Applications, le Dock ou Spotlight peuvent donc la rouvrir.
DMG_APP="${RELANCE_APP_DMG:-/Applications/Atelier.app}"
APP_SUPPORT="${ATELIER_APP_SUPPORT:-$HOME/Library/Application Support/atelier-studio}"
LOCK_FILE="$APP_SUPPORT/sidecar.lock"
# Surchargeables par scripts/tests/test-relance-app.sh seulement, pour ne
# jamais viser le vrai Atelier pendant un test.
APP_PROCESS="${RELANCE_NOM_APP:-tauri-app}"
SERVERS_PATTERN="${RELANCE_MOTIF_SERVEURS:-/Atelier\.app/Contents/Resources/rust-server/}"
GRACE_SECONDS="${RELANCE_DELAI_TERM:-5}"

say() { printf '%s\n' "$*"; }
fail() {
  local code="$1"
  shift
  printf 'ÉCHEC — %s\n' "$*" >&2
  exit "$code"
}

# --- Processus ---------------------------------------------------------

alive() {
  local stat
  stat="$(ps -o stat= -p "$1" 2>/dev/null | tr -d ' ')"
  [ -n "$stat" ] && [ "${stat#Z}" = "$stat" ]
}

group_alive() {
  local pid
  for pid in $(pgrep -g "$1" 2>/dev/null); do
    alive "$pid" && return 0
  done
  return 1
}

pgid_of() { ps -o pgid= -p "$1" 2>/dev/null | tr -d ' '; }

app_pids() { pgrep -x "$APP_PROCESS" 2>/dev/null; }
server_pids() { pgrep -f -- "$SERVERS_PATTERN" 2>/dev/null; }
studio_pids() { pgrep -f -- "${SERVERS_PATTERN}atelier-studio-server" 2>/dev/null; }

# Descendants (récursifs) des PID donnés, un par ligne.
descendants() {
  local queue="$*" next pid child
  while [ -n "$queue" ]; do
    next=""
    for pid in $queue; do
      for child in $(pgrep -P "$pid" 2>/dev/null); do
        printf '%s\n' "$child"
        next="$next $child"
      done
    done
    queue="${next# }"
  done
}

# Vrai si ce script tourne dans Atelier : un tour de chat (son CLI descend du
# serveur) ou le terminal intégré (descend de l'app). L'arrêt couperait
# alors le script lui-même avant la relance.
inside_atelier() {
  local pid="${1:-$$}" cmd
  while [ -n "$pid" ] && [ "$pid" -gt 1 ] 2>/dev/null; do
    cmd="$(ps -o command= -p "$pid" 2>/dev/null)"
    case "$cmd" in
      # Un `sh -c '…'` dont le TEXTE cite ces chemins n'est pas Atelier.
      *" -c "*) ;;
      *"/Contents/Resources/rust-server/"* | *"/Contents/MacOS/tauri-app"*) return 0 ;;
    esac
    pid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')"
  done
  return 1
}

# Groupes de processus des CLI d'agent, publiés par GET /activity
# (agentGroups) et relevés par check_no_turn juste avant l'arrêt. « ? » :
# inconnus (serveur muet ou build antérieure sans ce champ).
AGENT_GROUPS="?"

# Vrai si le mot $1 figure dans la liste $2 (mots séparés par des espaces).
in_list() {
  case " $2 " in *" $1 "*) return 0 ;; esac
  return 1
}

# Arrête l'app, tous les serveurs du bundle (chat, galeries, passerelle,
# outils), les processus de LEUR groupe, et les groupes des CLI d'agent.
# Les CLI tournent dans leur propre groupe (process_group(0)) : ils
# survivent à l'arrêt du serveur, même par kill -9, d'où l'arrêt de leur
# groupe entier. Seuls les groupes publiés par le serveur sont visés : il
# lance aussi en groupe propre ce qui DOIT survivre à une relance (calculs
# détachés atelier-run, jobs nohup du terminal intégré, noyaux, outils),
# que l'arrêt laisse vivre et liste. SIGTERM d'abord, SIGKILL après
# GRACE_SECONDS.
stop_atelier() {
  local own_pgid roots root_groups pids groups kept pid group waited survivors
  own_pgid="$(pgid_of $$)"
  roots="$(app_pids; server_pids)"
  roots="$(printf '%s\n' $roots | sort -un)"
  if [ -z "$roots" ]; then
    say "Arrêt : aucun processus Atelier ne tourne."
    return 0
  fi
  root_groups=""
  for pid in $roots; do
    group="$(pgid_of "$pid")"
    [ -n "$group" ] && [ "$group" != "$own_pgid" ] && ! in_list "$group" "$root_groups" \
      && root_groups="$root_groups $group"
  done
  pids="$roots"
  groups=""
  kept=""
  for pid in $(descendants $roots | sort -un); do
    group="$(pgid_of "$pid")"
    [ -n "$group" ] || continue
    if in_list "$group" "$root_groups"; then
      pids="$pids $pid"
    elif [ "$AGENT_GROUPS" != "?" ] && in_list "$group" "$AGENT_GROUPS" && [ "$group" != "$own_pgid" ]; then
      in_list "$group" "$groups" || groups="$groups $group"
    elif [ "$group" = "$pid" ]; then
      kept="$kept $pid" # chef d'un groupe propre qui n'est pas un CLI d'agent
    fi
  done
  pids="$(printf '%s\n' $pids | sort -un)"
  say "Arrêt : $(printf '%s\n' $pids | wc -l | tr -d ' ') processus, groupes de CLI d'agent :${groups:- aucun}"
  if [ "$AGENT_GROUPS" = "?" ]; then
    say "Arrêt : groupes de CLI d'agent inconnus (/activity muet ou ancien) : aucun groupe arrêté."
  fi
  if [ -n "$kept" ]; then
    say "Laissés en vie (groupe propre hors CLI d'agent : calcul détaché, job du terminal, noyau, outil) :"
    for pid in $kept; do ps -o pid=,pgid=,command= -p "$pid" 2>/dev/null | sed 's/^/  /'; done
    [ "$AGENT_GROUPS" = "?" ] && say "  Un CLI d'agent parmi eux s'arrête à la main : kill -TERM -- -PGID"
  fi
  for group in $groups; do kill -TERM -- "-$group" 2>/dev/null; done
  for pid in $pids; do kill -TERM "$pid" 2>/dev/null; done
  waited=0
  while [ "$waited" -lt "$((GRACE_SECONDS * 4))" ]; do
    survivors=""
    for pid in $pids; do alive "$pid" && survivors="$survivors $pid"; done
    for group in $groups; do group_alive "$group" && survivors="$survivors -$group"; done
    [ -z "$survivors" ] && break
    sleep 0.25
    waited=$((waited + 1))
  done
  if [ -n "$survivors" ]; then
    say "Arrêt : SIGKILL pour ceux qui ignorent SIGTERM :$survivors"
    for group in $groups; do kill -KILL -- "-$group" 2>/dev/null; done
    for pid in $pids; do kill -KILL "$pid" 2>/dev/null; done
    sleep 1
  fi
  survivors=""
  for pid in $pids $(app_pids) $(server_pids); do alive "$pid" && survivors="$survivors $pid"; done
  for group in $groups; do
    for pid in $(pgrep -g "$group" 2>/dev/null); do alive "$pid" && survivors="$survivors $pid"; done
  done
  if [ -n "$survivors" ]; then
    for pid in $(printf '%s\n' $survivors | sort -un); do
      ps -o pid=,pgid=,command= -p "$pid" 2>/dev/null >&2
    done
    fail 1 "un processus Atelier survit à l'arrêt (liste ci-dessus)"
  fi
  say "Arrêt : terminé."
}

# --- Tours de chat -------------------------------------------------------

# Port et jeton du verrou du serveur de chat (JSON compact ou indenté).
lock_field() {
  sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\{0,1\}\([0-9A-Za-z]*\).*/\1/p" "$LOCK_FILE" 2>/dev/null | head -1
}

# Corps de GET /activity, ou rien (code 1) si le serveur ne répond pas
# (build antérieure sans /activity, serveur bloqué). Le jeton passe par
# l'entrée standard de curl : ni affiché, ni dans `ps`.
activity_at() {
  printf 'x-atelier-token: %s\n' "$2" \
    | curl -fsS --max-time 3 -H @- "http://127.0.0.1:$1/activity" 2>/dev/null
}

# Champ runningTurns d'un corps /activity, ou « ? ».
turns_of() {
  local n
  n="$(printf '%s' "$1" | sed -n 's/.*"runningTurns"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' | head -1)"
  printf '%s\n' "${n:-?}"
}

# Champ agentGroups (liste de pgid) d'un corps /activity, séparés par des
# espaces, ou « ? » si le champ manque.
groups_of() {
  local list
  case "$1" in *'"agentGroups"'*) ;; *) printf '?\n'; return 0 ;; esac
  list="$(printf '%s' "$1" | sed -n 's/.*"agentGroups"[[:space:]]*:[[:space:]]*\[\([0-9, ]*\)\].*/\1/p' | head -1)"
  printf '%s\n' "$(printf '%s' "$list" | tr ',' ' ' | tr -s ' ' | sed 's/^ //;s/ $//')"
}

# Corps /activity du serveur de chat en cours ; un corps vide de tours s'il ne tourne pas
# (0 tour, aucun groupe) ; rien s'il ne répond pas.
activity() {
  if [ -z "$(studio_pids)" ]; then
    printf '{"runningTurns":0,"agentGroups":[]}\n'
    return 0
  fi
  local port
  port="$(lock_field port)"
  [ -n "$port" ] || return 1
  activity_at "$port" "$(lock_field token)"
}

count_turns() { turns_of "$(activity)"; }

check_no_turn() {
  local body turns
  body="$(activity)"
  turns="$(turns_of "$body")"
  AGENT_GROUPS="$(groups_of "$body")"
  case "$turns" in
    0) say "Tours de chat : aucun en cours." ;;
    "?") say "Tours de chat : état inconnu (serveur sans /activity ou injoignable). Vérifier dans l'app qu'aucun fil n'est « en cours »." ;;
    *) fail 3 "$turns tour(s) de chat en cours : rien n'a été arrêté. Attendre leur fin (ou les arrêter dans l'app), puis relancer." ;;
  esac
}

# --- Confirmation --------------------------------------------------------

CONFIRMED=0

warn_editors() {
  say "Attention : les éditeurs (LaTeX, code, Markdown, notes) ne signalent pas"
  say "encore leurs modifications non enregistrées à l'app. Tout tampon non"
  say "enregistré sera perdu à l'arrêt."
}

confirm_stop() {
  warn_editors
  [ "$CONFIRMED" = 1 ] && return 0
  if [ -t 0 ]; then
    printf 'Les éditeurs ouverts sont-ils enregistrés, et Thierry est-il d accord pour arrêter ? [o/N] '
    local answer
    read -r answer
    case "$answer" in o | O | oui | Oui) return 0 ;; esac
  fi
  fail 2 "arrêt non confirmé : relancer avec --confirme une fois les éditeurs enregistrés et l'accord de Thierry obtenu"
}

# --- Builds installées ---------------------------------------------------

copy_bundle() {
  if command -v ditto >/dev/null 2>&1; then
    ditto "$1" "$2" # garde signature, attributs étendus et liens
  else
    cp -pR "$1" "$2"
  fi
}

build_info() {
  local commit dirty
  commit="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || printf 'inconnu')"
  dirty="non"
  [ -n "$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null | head -1)" ] && dirty="oui"
  printf 'worktree=%s\ncommit=%s\nbranche=%s\nmodifications_non_commitees=%s\ninstallee=%s\nsource=%s\n' \
    "$REPO_ROOT" "$commit" "$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null)" \
    "$dirty" "$(date '+%Y-%m-%d %H:%M')" "$1"
}

# Copie un bundle dans la zone d'attente (l'app peut tourner pendant ce temps).
stage_bundle() {
  local source="$1" label="$2"
  [ -d "$source" ] || fail 1 "bundle introuvable : $source"
  rm -rf "$STAGING_DIR" && mkdir -p "$STAGING_DIR" || fail 1 "zone d'attente impossible : $STAGING_DIR"
  copy_bundle "$source" "$STAGING_DIR/Atelier.app" || fail 1 "copie de $source impossible"
  build_info "$label" >"$STAGING_DIR/build.txt"
}

# App arrêtée : la build en attente devient la courante, la courante devient
# la précédente (l'ancienne précédente est supprimée).
promote_staged() {
  [ -d "$STAGING_DIR/Atelier.app" ] || fail 1 "aucune build en attente dans $STAGING_DIR"
  mkdir -p "$RESERVE_DIR" || fail 1 "dossier $RESERVE_DIR impossible"
  if [ -d "$INSTALL_APP" ]; then
    rm -rf "$RESERVE_DIR/Atelier.app" "$RESERVE_DIR/precedente.txt" || fail 1 "suppression de l'ancienne précédente impossible"
    mv "$INSTALL_APP" "$RESERVE_DIR/Atelier.app" || fail 1 "déplacement de la build courante impossible"
    [ -f "$RESERVE_DIR/courante.txt" ] && mv "$RESERVE_DIR/courante.txt" "$RESERVE_DIR/precedente.txt"
  fi
  mkdir -p "$INSTALL_ROOT"
  mv "$STAGING_DIR/Atelier.app" "$INSTALL_APP" \
    || fail 1 "installation impossible ; la build d'avant est dans $RESERVE_DIR : bash scripts/relance-app.sh --retour --confirme"
  mv "$STAGING_DIR/build.txt" "$RESERVE_DIR/courante.txt" 2>/dev/null
  rmdir "$STAGING_DIR" 2>/dev/null
  return 0
}

# App arrêtée : échange la courante et la précédente.
swap_with_previous() {
  [ -d "$RESERVE_DIR/Atelier.app" ] || fail 1 "aucune build précédente dans $RESERVE_DIR"
  local swap="$RESERVE_DIR/.echange"
  rm -rf "$swap" && mkdir -p "$swap" || fail 1 "dossier $swap impossible"
  if [ -d "$INSTALL_APP" ]; then
    mv "$INSTALL_APP" "$swap/Atelier.app" || fail 1 "déplacement de la build courante impossible"
    [ -f "$RESERVE_DIR/courante.txt" ] && mv "$RESERVE_DIR/courante.txt" "$swap/build.txt"
  fi
  mv "$RESERVE_DIR/Atelier.app" "$INSTALL_APP" || fail 1 "remise en place de la précédente impossible (elle est dans $swap)"
  [ -f "$RESERVE_DIR/precedente.txt" ] && mv "$RESERVE_DIR/precedente.txt" "$RESERVE_DIR/courante.txt"
  if [ -d "$swap/Atelier.app" ]; then
    mv "$swap/Atelier.app" "$RESERVE_DIR/Atelier.app"
    [ -f "$swap/build.txt" ] && mv "$swap/build.txt" "$RESERVE_DIR/precedente.txt"
  fi
  rm -rf "$swap"
  return 0
}

launch_installed() {
  local bin="$INSTALL_APP/Contents/MacOS/tauri-app" pid="" cmd tries=0
  [ -x "$bin" ] || fail 1 "binaire absent : $bin"
  open -n "$INSTALL_APP" || fail 1 "open -n $INSTALL_APP a échoué"
  while [ -z "$pid" ] && [ "$tries" -lt 20 ]; do
    sleep 1
    pid="$(app_pids | head -1)"
    tries=$((tries + 1))
  done
  [ -n "$pid" ] || fail 1 "tauri-app absent après le lancement ; revenir en arrière : bash scripts/relance-app.sh --retour --confirme"
  cmd="$(ps -p "$pid" -o command=)"
  case "$cmd" in
    "$bin"*) say "OK — Atelier relancé depuis $INSTALL_APP (pid $pid)" ;;
    *) fail 1 "mauvais bundle lancé : $cmd" ;;
  esac
  [ -f "$RESERVE_DIR/courante.txt" ] && sed 's/^/  /' "$RESERVE_DIR/courante.txt"
  warn_dmg_copy
  return 0
}

# Une seconde copie (DMG) dans /Applications peut être rouverte à la place de
# ~/Applications/Atelier.app par le Dock, Spotlight ou Launch Services, et
# servir l'ancien code. Le script ne la supprime pas : il le dit.
warn_dmg_copy() {
  [ -d "$DMG_APP" ] || return 0
  [ "$DMG_APP" = "$INSTALL_APP" ] && return 0
  say "Attention : $DMG_APP existe aussi (même identifiant de bundle)."
  say "  Le Dock ou Spotlight peut rouvrir cette copie périmée au lieu de $INSTALL_APP."
  say "  Une fois la nouvelle build validée, la mettre à la corbeille (elle n'est pas"
  say "  le retour arrière : celui-ci est dans $RESERVE_DIR), et garder dans le Dock"
  say "  l'icône de $INSTALL_APP."
  return 0
}

build_app() {
  local log="${TMPDIR:-/tmp}/atelier-build-$(basename "$REPO_ROOT")-$$.log" status
  say "Build : npm run tauri:build:app (journal : $log)"
  (cd "$REPO_ROOT" && npm run tauri:build:app) >"$log" 2>&1
  status=$?
  if [ "$status" -ne 0 ]; then
    tail -n 80 "$log" >&2
    printf 'Build raté (code %s), journal : %s\n' "$status" "$log" >&2
    return 4
  fi
  [ -x "$BUILT_APP/Contents/MacOS/tauri-app" ] || {
    printf 'Build sans binaire dans %s\n' "$BUILT_APP" >&2
    return 4
  }
  return 0
}

running_app_command() {
  local pid
  pid="$(app_pids | head -1)"
  [ -n "$pid" ] && ps -p "$pid" -o command= 2>/dev/null
}

# Bundle (…/Atelier.app) d'où tourne l'app ; rien si elle ne tourne pas.
running_bundle() {
  local cmd
  cmd="$(running_app_command)" || return 0
  case "$cmd" in
    */Contents/MacOS/*) printf '%s\n' "${cmd%%/Contents/MacOS/*}" ;;
  esac
  return 0
}

# Juste avant l'arrêt. Sans build installée dans $INSTALL_APP (premier
# passage), l'app peut tourner depuis un autre bundle : /Applications (DMG)
# ou le target/ d'un autre worktree. Ce bundle est alors copié comme build
# courante, que promote_staged garde ensuite comme précédente : la relance
# la plus risquée a elle aussi son retour arrière.
keep_running_bundle() {
  [ -d "$INSTALL_APP" ] && return 0
  local bundle
  bundle="$(running_bundle)"
  if [ -z "$bundle" ] || [ ! -d "$bundle" ]; then
    say "Précédente : aucune build installée ni lancée à garder ; --retour ne sera possible qu'après la prochaine relance."
    return 0
  fi
  # Depuis target/ de ce worktree : cmd_relaunch l'a déjà mise en attente.
  [ "$bundle" = "$BUILT_APP" ] && return 0
  say "Précédente : copie de la build qui tourne ($bundle)."
  mkdir -p "$INSTALL_ROOT" "$RESERVE_DIR" || fail 1 "dossier $INSTALL_ROOT impossible : rien n'a été arrêté"
  if ! copy_bundle "$bundle" "$INSTALL_APP"; then
    rm -rf "$INSTALL_APP"
    fail 1 "copie de $bundle impossible : rien n'a été arrêté"
  fi
  printf 'commit=inconnu\ninstallee=%s\nsource=copie de la build qui tournait depuis %s\n' \
    "$(date '+%Y-%m-%d %H:%M')" "$bundle" >"$RESERVE_DIR/courante.txt"
  return 0
}

# Confirmation puis arrêt. Les tours sont recontrôlés juste avant l'arrêt :
# la question de confirm_stop attend sans limite, et un tour a pu démarrer
# pendant ce temps (ou pendant la copie de keep_running_bundle).
confirm_and_stop() {
  check_no_turn
  confirm_stop
  keep_running_bundle
  check_no_turn
  stop_atelier
}

# --- Commandes -----------------------------------------------------------

preflight() {
  [ "$(uname -s)" = "Darwin" ] || fail 2 "macOS seulement (src-tauri ne se construit pas ailleurs)"
  inside_atelier && fail 2 "ce script tourne dans Atelier (tour de chat ou terminal intégré) : l'arrêt le couperait avant la relance. Le lancer depuis Terminal ou une session hors d'Atelier."
  return 0
}

cmd_relaunch() {
  preflight
  say "Worktree : $REPO_ROOT"
  say "Installation : $INSTALL_APP (précédente : $RESERVE_DIR/Atelier.app)"
  case "$(running_app_command)" in
    "$BUILT_APP/Contents/MacOS/tauri-app"*)
      # L'app tourne depuis le bundle que le build va réécrire : elle doit
      # s'arrêter avant (signature invalidée sinon). Arrive une fois ; après,
      # elle tourne depuis la copie installée.
      say "L'app tourne depuis $BUILT_APP, que le build réécrit : copie de sauvegarde, puis arrêt avant le build."
      stage_bundle "$BUILT_APP" "copie de la build qui tournait depuis target/"
      confirm_and_stop
      promote_staged
      if ! build_app; then
        say "Retour à la build qui tournait :"
        launch_installed
        exit 4
      fi
      ;;
    *)
      if ! build_app; then
        fail 4 "build raté : rien n'a été arrêté, l'app tourne toujours"
      fi
      ;;
  esac
  stage_bundle "$BUILT_APP" "build de $REPO_ROOT"
  confirm_and_stop
  promote_staged
  launch_installed
}

cmd_rollback() {
  preflight
  [ -d "$RESERVE_DIR/Atelier.app" ] || fail 1 "aucune build précédente dans $RESERVE_DIR"
  say "Retour arrière : la build précédente remplace la courante (et inversement)."
  [ -f "$RESERVE_DIR/precedente.txt" ] && sed 's/^/  /' "$RESERVE_DIR/precedente.txt"
  confirm_and_stop
  swap_with_previous
  launch_installed
}

cmd_status() {
  say "Courante : $INSTALL_APP"
  if [ -f "$RESERVE_DIR/courante.txt" ]; then sed 's/^/  /' "$RESERVE_DIR/courante.txt"; else say "  (aucune fiche)"; fi
  say "Précédente : $RESERVE_DIR/Atelier.app"
  if [ -d "$RESERVE_DIR/Atelier.app" ] && [ -f "$RESERVE_DIR/precedente.txt" ]; then
    sed 's/^/  /' "$RESERVE_DIR/precedente.txt"
  else
    say "  (aucune)"
  fi
  say "App lancée : $(running_app_command || printf 'aucune')"
  say "Serveurs du bundle :"
  local pid
  for pid in $(server_pids); do ps -o pid=,command= -p "$pid" 2>/dev/null | sed 's/^/  /'; done
  say "Tours de chat en cours : $(count_turns)"
  warn_dmg_copy
}

main() {
  local action=relaunch arg
  for arg in "$@"; do
    case "$arg" in
      --confirme) CONFIRMED=1 ;;
      --retour) action=rollback ;;
      --etat) action=status ;;
      -h | --help)
        sed -n '2,21p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
        return 0
        ;;
      *) fail 2 "option inconnue : $arg (voir --help)" ;;
    esac
  done
  if [ "$action" != status ] && [ "$CONFIRMED" != 1 ] && [ ! -t 0 ]; then
    fail 2 "--confirme manque : sans terminal, l'arrêt doit être confirmé d'avance (éditeurs enregistrés, accord de Thierry)"
  fi
  case "$action" in
    relaunch) cmd_relaunch ;;
    rollback) cmd_rollback ;;
    status) cmd_status ;;
  esac
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
