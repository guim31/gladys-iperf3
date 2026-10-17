# iPerf3

Mesurez le débit de votre **réseau local** depuis Gladys : le Wi-Fi jusqu'au bureau, les adaptateurs
CPL jusqu'au garage, le câble jusqu'au NAS. L'intégration lance le client
[iperf3](https://iperf.fr/) vers des serveurs iperf3 que **vous** faites tourner sur vos machines,
périodiquement et à la demande, et garde l'historique de chaque liaison.

Elle ne mesure pas votre connexion Internet : pour cela, voyez l'intégration Speedtest.net. Ici,
chaque mesure reste sur votre réseau.

## Ce que vous obtenez

- **Un appareil par serveur iperf3**, avec les débits descendant et montant (Mbit/s, avec
  historique), les retransmissions TCP (ou la gigue et les pertes de paquets en UDP), et « dernière
  mesure réussie ».
- Des **mesures automatiques** toutes les 1 à 24 heures (6 par défaut), ou à la demande seulement.
- Un **widget** de tableau de bord : les derniers débits de chaque serveur, ou les tuiles et le
  graphique de la semaine d'un seul, avec un bouton pour remesurer.
- Deux **déclencheurs de scène** : un serveur devient injoignable, un débit passe sous un seuil.
- Une **action de scène** : mesurer un serveur et utiliser les débits dans les étapes suivantes.

## Prérequis

- Gladys Assistant **5.1.0** ou plus récent.
- Un **serveur iperf3** sur chaque machine à mesurer : `iperf3 -s` (port 5201 par défaut). iperf3
  existe pour Linux, Windows, macOS, la plupart des NAS (paquets Synology et QNAP, image Docker
  `networkstatic/iperf3`) et les routeurs OpenWrt. Lancez-le comme un service pour qu'il survive à un
  redémarrage.
- Le serveur doit être joignable depuis la machine Gladys sur son port TCP (et UDP en mode UDP).

Le client iperf3 est inclus dans l'image de l'intégration : rien à installer côté Gladys.
L'intégration ne lance jamais de serveur iperf3.

## Configuration

| Champ                          | Rôle                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| Serveurs iperf3                | Liste séparée par des virgules : `adresse`, ou `nom=adresse`, avec `:port` s'il ≠ 5201.      |
| Mesure automatique             | Jamais (à la demande), toutes les 1, 2, 3, 6, 12 heures, ou une fois par jour. Défaut : 6 h. |
| Protocole                      | TCP (débit réel, retransmissions) ou UDP (débit fixe, gigue et pertes de paquets).           |
| Durée par sens (s)             | 3 à 20 secondes, 5 par défaut. Une mesure dure environ le double, plus 2 secondes.           |
| Flux parallèles                | 1 à 8. Plusieurs flux remplissent mieux les liens rapides (2,5 Gbit/s et plus).              |
| Débit UDP (Mbit/s)             | UDP seulement : le débit envoyé. Au-delà de ce que le lien supporte, les pertes montent.     |
| Seuil de débit faible (Mbit/s) | Pour le déclencheur « Débit sous le seuil ». 0 le désactive.                                 |
| Langue des noms                | Langue des noms de fonctionnalités et des messages. Défaut : français.                       |

Exemple : `NAS=192.168.1.10, Bureau=192.168.1.20:5202, [fd00::30]`. Jusqu'à 10 serveurs. Une entrée
erronée est ignorée et signalée dans la réponse du bouton **Mesurer tous les serveurs** et dans les
journaux.

Ouvrez ensuite l'onglet **Découverte** de l'intégration et ajoutez les appareils à suivre. Seuls les
appareils ajoutés à Gladys sont mesurés automatiquement ; le bouton **Mesurer tous les serveurs**
mesure tous les serveurs de la liste, ce qui permet de vérifier la configuration d'abord.

## Appareils

Chaque serveur donne un appareil à son nom (« iPerf3 192.168.1.10 » sans nom), avec :

| Fonctionnalité          | Type           | Remarques                                                     |
| ----------------------- | -------------- | ------------------------------------------------------------- |
| Débit descendant        | Débit (Mbit/s) | Serveur → Gladys, mesuré par le récepteur.                    |
| Débit montant           | Débit (Mbit/s) | Gladys → serveur, mesuré par le récepteur.                    |
| Retransmissions TCP     | Compteur       | TCP seulement : segments renvoyés, deux sens additionnés.     |
| Gigue                   | Durée (ms)     | UDP seulement : le pire des deux sens.                        |
| Pertes de paquets       | Pourcentage    | UDP seulement : le pire des deux sens.                        |
| Dernière mesure réussie | Binaire        | 0 quand la dernière mesure a échoué (les débits sont gardés). |

Les valeurs sont mises à jour après chaque mesure, jamais interrogées par Gladys. Changer de
protocole change les fonctionnalités : l'onglet Découverte propose alors de **Mettre à jour** les
appareils.

## Widget de tableau de bord

Ajoutez le widget **Débit du réseau local**. Sans réglage, il liste tous les serveurs avec leurs
derniers débits (ou la raison de l'échec de la dernière mesure), avec un bouton **Tout mesurer**.
Choisissez un serveur dans ses réglages (ou n'en ayez qu'un) pour voir ses tuiles de débit en direct,
le graphique de la dernière semaine, l'heure de la dernière mesure et un bouton **Mesurer**. Les
boutons lancent la mesure en arrière-plan ; le widget se met à jour à la fin.

## Déclencheurs de scène

- **Serveur iperf3 injoignable** : une mesure n'a pas pu joindre un serveur qui répondait (refus, pas
  de réponse, nom inconnu). Il part une fois par panne, et de nouveau seulement après une mesure
  réussie. Un serveur occupé par un autre test ne compte pas. Filtre : le serveur. Variables : nom du
  serveur, adresse, raison.
- **Débit sous le seuil** : le débit descendant ou montant d'une mesure est sous le seuil de la
  configuration. Il part une fois par sens, et de nouveau seulement après que le débit est remonté.
  Filtres : le serveur, le sens. Variables : nom du serveur, débit, seuil.

Le déclencheur habituel de Gladys « la valeur d'un appareil change » marche aussi sur les débits.

## Action de scène

**Mesurer un serveur iperf3** mesure tout de suite le serveur choisi (avant les mesures planifiées) et
renvoie `success` (1 ou 0), `download_mbps` et `upload_mbps` pour les étapes suivantes : un
« Continuer seulement si » sur `success`, un message avec les débits. Une mesure ratée renvoie
`success` = 0 plutôt qu'une erreur, pour que la scène puisse réagir.

## Exemples de scènes

- **Surveillance du CPL** : quand « Débit sous le seuil » part pour l'adaptateur du garage, envoyer un
  message « CPL lent » avec la variable du débit.
- **NAS en panne** : quand « Serveur iperf3 injoignable » part pour le NAS, envoyer un message
  Telegram avec la raison.
- **Contrôle nocturne** : chaque nuit à 3 h, mesurer le Wi-Fi du bureau, puis envoyer le résultat dans
  un message.

## Dépannage

- **« serveur injoignable »** : vérifiez que `iperf3 -s` tourne sur le serveur, que son port (5201 par
  défaut) est ouvert dans son pare-feu, et que l'adresse est juste. Depuis une autre machine,
  `iperf3 -c <adresse>` doit marcher.
- **« serveur occupé par un autre test »** : un serveur iperf3 ne sert qu'un client à la fois.
  L'intégration réessaie après 5 secondes ; un autre client (ou un second Gladys) teste sans doute en
  même temps.
- **Débits faibles sur un lien rapide** : passez les flux parallèles à 4, et allongez la durée. La
  machine Gladys elle-même (un Raspberry Pi, par exemple) peut être le goulot.
- **Beaucoup de pertes en UDP** : le débit UDP dépasse ce que le lien supporte ; baissez-le.
- Plus de détails avec `LOG_LEVEL=debug` dans les journaux de l'intégration.

## Limites

- Une mesure à la fois, les serveurs l'un après l'autre : 10 serveurs prennent quelques minutes.
- Une mesure charge le lien mesuré : gardez un intervalle raisonnable sur un Wi-Fi chargé.
- Les débits sont ceux entre la machine Gladys et le serveur, pas entre deux autres machines.
- Le conteneur Gladys tourne sur un réseau en pont : un serveur IPv6 demande l'IPv6 activé dans
  Docker.
- Avec « Jamais », les valeurs ne changent pas d'elles-mêmes et Gladys peut les signaler comme
  anciennes au-delà de 48 heures.
