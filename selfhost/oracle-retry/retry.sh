#!/usr/bin/env bash
# Retente la création de l'instance ARM Oracle toutes les 60s jusqu'à succès.
# Remplis les 5 valeurs ci-dessous (voir README.md pour où les trouver).
set -uo pipefail

COMPARTMENT_ID="ocid1.compartment.oc1..REMPLACE_MOI"
SUBNET_ID="ocid1.subnet.oc1.eu-paris-1..REMPLACE_MOI"
IMAGE_ID="ocid1.image.oc1.eu-paris-1..REMPLACE_MOI"
SSH_KEY_PATH="$HOME/.ssh/id_rsa.pub"     # ta clé publique (le .pub, pas le .key)
DISPLAY_NAME="scaleflow-phones"
AVAILABILITY_DOMAIN="EU-PARIS-1-AD-1"     # celle vue dans la console (préfixe inclus si besoin)
SHAPE="VM.Standard.A1.Flex"
OCPUS=4
MEMORY_GB=24

[ "$COMPARTMENT_ID" != "ocid1.compartment.oc1..REMPLACE_MOI" ] || { echo "✗ Remplis d'abord COMPARTMENT_ID dans ce fichier."; exit 1; }
[ -f "$SSH_KEY_PATH" ] || { echo "✗ Clé SSH publique introuvable : $SSH_KEY_PATH"; exit 1; }

n=0
while true; do
  n=$((n+1))
  echo "[$(date '+%H:%M:%S')] Tentative #$n..."

  out=$(oci compute instance launch \
    --compartment-id "$COMPARTMENT_ID" \
    --availability-domain "$AVAILABILITY_DOMAIN" \
    --shape "$SHAPE" \
    --shape-config "{\"ocpus\": $OCPUS, \"memoryInGBs\": $MEMORY_GB}" \
    --subnet-id "$SUBNET_ID" \
    --image-id "$IMAGE_ID" \
    --display-name "$DISPLAY_NAME" \
    --assign-public-ip true \
    --ssh-authorized-keys-file "$SSH_KEY_PATH" \
    --wait-for-state RUNNING 2>&1)

  if echo "$out" | grep -q '"lifecycle-state": "RUNNING"'; then
    ip=$(echo "$out" | grep -o '"public-ip": *"[^"]*"' | head -1 | cut -d'"' -f4)
    echo ""
    echo "✅ Instance créée et démarrée !"
    echo "   IP publique (si visible ci-dessus) : ${ip:-vérifie dans la console}"
    echo "   Sinon : Menu Oracle → Compute → Instances → $DISPLAY_NAME"
    break
  fi

  if echo "$out" | grep -qi "out of capacity\|OutOfCapacity"; then
    echo "   → capacité indisponible, nouvelle tentative dans 60s..."
  elif echo "$out" | grep -qi "TooManyRequests\|too many requests"; then
    echo "   → rate-limit Oracle, pause plus longue (180s)..."
    sleep 180
    continue
  else
    echo "   → erreur inattendue :"
    echo "$out" | head -20
    echo "   (nouvelle tentative dans 60s quand même)"
  fi
  sleep 60
done
