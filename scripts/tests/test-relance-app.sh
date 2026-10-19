#!/usr/bin/env bash
# Tests de scripts/relance-app.sh sous Linux ou macOS, sans toucher au vrai
# Atelier : faux bundle, faux serveurs (dont un qui ignore SIGTERM), faux CLI
# dans son propre groupe de processus, faux verrou, fausses builds installées.
#
#   bash scripts/tests/test-relance-app.sh
set -o pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SCRIPT="$HERE/../relance-app.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/test-relance.XXXXXX")"
FAILS=0
PASSES=0

ok() { PASSES=$((PASSES + 1)); printf 'ok   %s\n' "$1"; }
ko() { FAILS=$((FAILS + 1)); printf 'ÉCHEC %s\n' "$1"; }
check() { if eval "$2"; then ok "$1"; else ko "$1"; fi; }

# Le nom du faux bundle contient le PID du test : aucun autre processus ne
# peut correspondre au motif, ni le vrai Atelier.
BUNDLE="FauxAtelier$$"
export RELANCE_NOM_APP="fauxtauri$$"
RELANCE_NOM_APP="${RELANCE_NOM_APP:0:15}" # pgrep -x compare le nom tronqué à 15
export RELANCE_MOTIF_SERVEURS="/$BUNDLE\.app/Contents/Resources/rust-server/"
export RELANCE_DELAI_TERM=1
export ATELIER_INSTALL_ROOT="$WORK/Applications"
export ATELIER_APP_SUPPORT="$WORK/support"
SERVERS="$WORK/$BUNDLE.app/Contents/Resources/rust-server"
PIDS_FILE="$WORK/pids"

cleanup() {
  local pid
  for pid in $(cat "$PIDS_FILE" 2>/dev/null); do
    kill -KILL "-$pid" 2>/dev/null
    kill -KILL "$pid" 2>/dev/null
  done
  rm -rf "$WORK"
}
trap cleanup EXIT

# shellcheck source=../relance-app.sh
source "$SCRIPT"

# --- Faux Atelier --------------------------------------------------------

mkdir -p "$SERVERS"
cp "$(command -v sleep)" "$WORK/$RELANCE_NOM_APP"
# Serveur de chat : lance un faux CLI dans son propre groupe (comme
# process_group(0) côté Rust), qui lance lui-même un enfant.
cat >"$SERVERS/atelier-studio-server" <<'EOF'
#!/usr/bin/env bash
python3 -c '
import os, subprocess, sys, time
os.setpgrp()
child = subprocess.Popen(["sleep", "300"])
with open(sys.argv[1], "a") as fh:
    fh.write("%d\n%d\n" % (os.getpid(), child.pid))
time.sleep(300)
' "$1" &
wait
EOF
# Serveur galerie qui ignore SIGTERM : seul SIGKILL l'arrête.
cat >"$SERVERS/atelier-gallery-server" <<'EOF'
#!/usr/bin/env bash
trap '' TERM
while :; do sleep 1; done
EOF
chmod +x "$SERVERS/atelier-studio-server" "$SERVERS/atelier-gallery-server"

start_fake_atelier() {
  : >"$PIDS_FILE"
  # disown : bash ne signale pas « Killed » pour ces faux processus.
  "$WORK/$RELANCE_NOM_APP" 300 &
  echo $! >>"$PIDS_FILE"
  disown $!
  "$SERVERS/atelier-studio-server" "$WORK/cli" &
  echo $! >>"$PIDS_FILE"
  disown $!
  "$SERVERS/atelier-gallery-server" 4101 &
  echo $! >>"$PIDS_FILE"
  disown $!
  "$SERVERS/atelier-gallery-server" 4102 &
  echo $! >>"$PIDS_FILE"
  disown $!
  local tries=0
  while [ "$(cat "$WORK/cli" 2>/dev/null | wc -l | tr -d " ")" -lt 2 ] && [ "$tries" -lt 40 ]; do
    sleep 0.1
    tries=$((tries + 1))
  done
  cat "$WORK/cli" >>"$PIDS_FILE"
}

# --- Arrêt ---------------------------------------------------------------

rm -f "$WORK/cli"
start_fake_atelier
CLI_PID="$(sed -n 1p "$WORK/cli")"
CLI_CHILD="$(sed -n 2p "$WORK/cli")"
check "le faux CLI a son propre groupe" '[ -n "$CLI_PID" ] && [ "$(pgid_of "$CLI_PID")" = "$CLI_PID" ] && [ "$CLI_PID" != "$(pgid_of $$)" ]'
check "deux serveurs galerie trouvés (cas multi-PID)" '[ "$(server_pids | wc -l | tr -d " ")" -ge 3 ]'
check "le CLI descend du serveur de chat" 'descendants $(studio_pids) | grep -x "$CLI_PID" >/dev/null'

OWN_PGID="$(pgid_of $$)"
(stop_atelier) >"$WORK/stop.out" 2>&1
STOP_STATUS=$?
check "arrêt : code 0" '[ "$STOP_STATUS" = 0 ]'
check "arrêt : SIGKILL pour le serveur qui ignore SIGTERM" 'grep -q SIGKILL "$WORK/stop.out"'
check "arrêt : plus d'app ni de serveur" '[ -z "$(app_pids)" ] && [ -z "$(server_pids)" ]'
check "arrêt : le CLI et son enfant sont arrêtés" '! alive "$CLI_PID" && ! alive "$CLI_CHILD"'
check "arrêt : le groupe du test survit" 'kill -0 $$ && [ "$(pgid_of $$)" = "$OWN_PGID" ]'
(stop_atelier) >"$WORK/stop2.out" 2>&1
check "arrêt sans rien qui tourne : code 0" '[ $? = 0 ] && grep -q "aucun processus" "$WORK/stop2.out"'

# Un processus hors Atelier n'est jamais visé.
sleep 300 &
BYSTANDER=$!
echo "$BYSTANDER" >>"$PIDS_FILE"
disown "$BYSTANDER"
rm -f "$WORK/cli"
start_fake_atelier
(stop_atelier) >/dev/null 2>&1
check "arrêt : un processus étranger n'est pas touché" 'alive "$BYSTANDER"'
kill -KILL "$BYSTANDER" 2>/dev/null

# --- Lancé depuis Atelier ? ---------------------------------------------

cat >"$SERVERS/atelier-studio-server" <<'EOF2'
#!/usr/bin/env bash
bash -c 'source "$1"; inside_atelier && echo DEDANS || echo DEHORS' _ "$2"
EOF2
check "détecte un script lancé sous un serveur du bundle" '[ "$("$SERVERS/atelier-studio-server" x "$SCRIPT")" = DEDANS ]'
check "hors Atelier : pas de refus" '! inside_atelier'
check "un sh -c qui cite le chemin du bundle n'est pas Atelier" '[ "$(bash -c ": /Contents/MacOS/tauri-app; source \"\$1\"; inside_atelier && echo DEDANS || echo DEHORS" _ "$SCRIPT")" = DEHORS ]'

# --- Verrou du serveur de chat ------------------------------------------

mkdir -p "$ATELIER_APP_SUPPORT"
printf '{"identity":{"pid":12,"port":51234},"port":51234,"token":"0a1b2c3d4e5f"}\n' >"$LOCK_FILE"
check "verrou compact : port" '[ "$(lock_field port)" = 51234 ]'
check "verrou compact : jeton" '[ "$(lock_field token)" = 0a1b2c3d4e5f ]'
printf '{\n  "port": 4321,\n  "token": "abcdef0123",\n  "identity": {\n    "port": 4321\n  }\n}\n' >"$LOCK_FILE"
check "verrou indenté : port" '[ "$(lock_field port)" = 4321 ]'
check "verrou indenté : jeton" '[ "$(lock_field token)" = abcdef0123 ]'
check "aucun serveur de chat : zéro tour" '[ "$(count_turns)" = 0 ]'
check "serveur injoignable : état inconnu" '[ "$(count_turns_at 1 x)" = "?" ]'
# Faux /activity : vérifie l'en-tête du jeton et répond comme le serveur.
python3 -c '
import http.server, sys
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        ok = self.path == "/activity" and self.headers.get("x-atelier-token") == "jeton"
        body = b"{\"runningTurns\": 2, \"running\": []}" if ok else b"{}"
        self.send_response(200 if ok else 401)
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a):
        pass
srv = http.server.HTTPServer(("127.0.0.1", 0), H)
open(sys.argv[1], "w").write(str(srv.server_port))
srv.serve_forever()
' "$WORK/port" &
FAKE_HTTP=$!
echo "$FAKE_HTTP" >>"$PIDS_FILE"
disown "$FAKE_HTTP"
tries=0
while [ ! -s "$WORK/port" ] && [ "$tries" -lt 50 ]; do sleep 0.1; tries=$((tries + 1)); done
check "/activity : tours comptés avec le bon jeton" '[ "$(count_turns_at "$(cat "$WORK/port")" jeton)" = 2 ]'
check "/activity : mauvais jeton, état inconnu" '[ "$(count_turns_at "$(cat "$WORK/port")" autre)" = "?" ]'
kill "$FAKE_HTTP" 2>/dev/null

# --- Builds installées : installation et retour arrière ------------------

fake_build() {
  rm -rf "$WORK/build-$1"
  mkdir -p "$WORK/build-$1/Atelier.app/Contents/MacOS"
  printf '%s\n' "$1" >"$WORK/build-$1/Atelier.app/Contents/MacOS/tauri-app"
  chmod +x "$WORK/build-$1/Atelier.app/Contents/MacOS/tauri-app"
}
installed() { cat "$INSTALL_APP/Contents/MacOS/tauri-app" 2>/dev/null; }
previous() { cat "$RESERVE_DIR/Atelier.app/Contents/MacOS/tauri-app" 2>/dev/null; }

fake_build v1
(stage_bundle "$WORK/build-v1/Atelier.app" "v1" && promote_staged) >/dev/null 2>&1
check "première installation : v1 courante, aucune précédente" '[ "$(installed)" = v1 ] && [ -z "$(previous)" ]'
check "fiche de la build courante écrite" 'grep -q "^source=v1$" "$RESERVE_DIR/courante.txt" && grep -q "^commit=" "$RESERVE_DIR/courante.txt"'
fake_build v2
(stage_bundle "$WORK/build-v2/Atelier.app" "v2") >/dev/null 2>&1
check "la build en attente ne touche pas la courante" '[ "$(installed)" = v1 ]'
(promote_staged) >/dev/null 2>&1
check "v2 installée, v1 gardée comme précédente" '[ "$(installed)" = v2 ] && [ "$(previous)" = v1 ]'
check "fiches suivies" 'grep -q "^source=v2$" "$RESERVE_DIR/courante.txt" && grep -q "^source=v1$" "$RESERVE_DIR/precedente.txt"'
fake_build v3
(stage_bundle "$WORK/build-v3/Atelier.app" "v3" && promote_staged) >/dev/null 2>&1
check "v3 installée, v2 précédente, v1 supprimée" '[ "$(installed)" = v3 ] && [ "$(previous)" = v2 ] && ! grep -rqx v1 "$ATELIER_INSTALL_ROOT"'
(swap_with_previous) >/dev/null 2>&1
check "retour arrière : v2 courante, v3 précédente" '[ "$(installed)" = v2 ] && [ "$(previous)" = v3 ]'
check "retour arrière : fiches échangées" 'grep -q "^source=v2$" "$RESERVE_DIR/courante.txt" && grep -q "^source=v3$" "$RESERVE_DIR/precedente.txt"'
(swap_with_previous) >/dev/null 2>&1
check "second retour : v3 de nouveau courante" '[ "$(installed)" = v3 ] && [ "$(previous)" = v2 ]'
check "aucun reste de zone d'attente ni d'échange" '[ ! -e "$STAGING_DIR" ] && [ ! -e "$RESERVE_DIR/.echange" ]'
rm -rf "$RESERVE_DIR/Atelier.app"
(swap_with_previous) >"$WORK/swap.out" 2>&1
check "retour sans précédente : refus, courante intacte" '[ $? = 1 ] && [ "$(installed)" = v3 ]'

# --- Premier passage : l'app tourne depuis un autre bundle ---------------

# Comme /Applications/Atelier.app (DMG) ou le target/ d'un autre worktree.
OTHER_BUNDLE="$WORK/Autre dossier/Atelier.app"
mkdir -p "$OTHER_BUNDLE/Contents/MacOS"
cp "$(command -v sleep)" "$OTHER_BUNDLE/Contents/MacOS/$RELANCE_NOM_APP"
"$OTHER_BUNDLE/Contents/MacOS/$RELANCE_NOM_APP" 300 &
OTHER_PID=$!
echo "$OTHER_PID" >>"$PIDS_FILE"
disown "$OTHER_PID"
sleep 0.2
check "bundle de l'app lancée relevé (chemin avec espace)" '[ "$(running_bundle)" = "$OTHER_BUNDLE" ]'
fresh_install() {
  INSTALL_ROOT="$WORK/$1"
  INSTALL_APP="$INSTALL_ROOT/Atelier.app"
  RESERVE_DIR="$INSTALL_ROOT/Atelier-precedente"
  STAGING_DIR="$RESERVE_DIR/.nouvelle"
}
fake_build v9
(
  fresh_install Apps2
  keep_running_bundle && stage_bundle "$WORK/build-v9/Atelier.app" v9 && promote_staged
) >"$WORK/keep.out" 2>&1
check "premier passage : la build qui tournait devient la précédente" '[ "$(cat "$WORK/Apps2/Atelier.app/Contents/MacOS/tauri-app")" = v9 ] && [ -x "$WORK/Apps2/Atelier-precedente/Atelier.app/Contents/MacOS/$RELANCE_NOM_APP" ]'
check "premier passage : fiche de la précédente" 'grep -q "^source=copie de la build qui tournait depuis $OTHER_BUNDLE$" "$WORK/Apps2/Atelier-precedente/precedente.txt"'
(
  fresh_install Apps3
  BUILT_APP="$OTHER_BUNDLE"
  keep_running_bundle
) >/dev/null 2>&1
check "depuis target/ de ce worktree : pas de seconde copie" '[ ! -e "$WORK/Apps3/Atelier.app" ]'
kill -KILL "$OTHER_PID" 2>/dev/null
sleep 0.2
(
  fresh_install Apps4
  keep_running_bundle
) >"$WORK/keep2.out" 2>&1
check "rien ne tourne ni n'est installé : dit qu'aucune précédente n'est gardée" '[ $? = 0 ] && grep -q "aucune build installée ni lancée" "$WORK/keep2.out" && [ ! -e "$WORK/Apps4/Atelier.app" ]'

# --- Un tour qui démarre pendant la confirmation -------------------------

(
  fresh_install Apps5
  : >"$WORK/turns"
  count_turns() {
    echo x >>"$WORK/turns"
    # 0 au premier contrôle, 1 au second (après la confirmation).
    [ "$(wc -l <"$WORK/turns" | tr -d " ")" -ge 2 ] && echo 1 || echo 0
  }
  stop_atelier() { echo ARRET; }
  CONFIRMED=1
  confirm_and_stop
) >"$WORK/race.out" 2>&1
check "tour démarré pendant la confirmation : refus (code 3), rien d'arrêté" '[ $? = 3 ] && ! grep -q ARRET "$WORK/race.out" && grep -q "1 tour(s) de chat en cours" "$WORK/race.out"'

# --- Options et refus -----------------------------------------------------

bash "$SCRIPT" --inconnue </dev/null >/dev/null 2>&1
check "option inconnue : code 2" '[ $? = 2 ]'
bash "$SCRIPT" </dev/null >"$WORK/noconfirm.out" 2>&1
check "sans --confirme ni terminal : code 2" '[ $? = 2 ] && grep -q -- "--confirme" "$WORK/noconfirm.out"'
if [ "$(uname -s)" != Darwin ]; then
  bash "$SCRIPT" --confirme </dev/null >/dev/null 2>&1
  check "hors macOS : code 2" '[ $? = 2 ]'
fi
bash "$SCRIPT" --etat </dev/null >"$WORK/etat.out" 2>&1
check "--etat : lecture seule, code 0" '[ $? = 0 ] && grep -q "Courante" "$WORK/etat.out" && [ "$(installed)" = v3 ]'
bash "$SCRIPT" --help >"$WORK/help.out" 2>&1
check "--help affiche l'usage" 'grep -q -- "--retour" "$WORK/help.out"'

printf '\n%s réussis, %s échoués\n' "$PASSES" "$FAILS"
[ "$FAILS" = 0 ]
