/*
 * Club gemellati e con reciprocità dello Yacht Club Italiano, dalla pagina
 * https://www.yachtclubitaliano.it/club-consociati (28 novembre 2026), con
 * i guidoni pubblicati lì (src/assets/clubs, rimpiccioliti).
 *
 * Solo Europa e Mediterraneo, anche i club in terraferma (Roma, Torino,
 * Ginevra…). Manca il Circolo Nautico della Presidenza del Consiglio (Roma):
 * sede non trovata. Posizioni da OpenStreetMap e dagli indirizzi dei club;
 * `approx` dove si sa solo la località (San Marino, Gstaad).
 */

const files = import.meta.glob('../assets/clubs/*', { eager: true, query: '?url', import: 'default' })
const burgee = (name) => files[`../assets/clubs/${name}`]

export const CLUB_KIND = {
  home: 'Yacht Club Italiano',
  twin: 'Gemellato con lo YCI',
  reciprocal: 'Reciprocità con lo YCI',
}

// Cosa vale per i soci YCI (dalla stessa pagina, in breve)
export const CLUB_ACCESS = {
  twin: 'Accesso libero a sede, ristorante e servizi con la tessera; regate e scuole vela in comune. Di prassi la segreteria YCI manda una lettera di presentazione con le date della visita.',
  reciprocal: 'Accesso alla sede con la tessera e una lettera di raccomandazione del Club.',
}

const C = (id, kind, name, place, lat, lon, url, img, extra = {}) => ({ id, kind, name, place, lat, lon, url, img: burgee(img), ...extra })

export const YCI_CLUBS = [
  C('yci', 'home', 'Yacht Club Italiano', 'Genova, Porticciolo Duca degli Abruzzi', 44.40038, 8.93201, 'https://www.yachtclubitaliano.it', 'yci.svg'),
  C('yci-portofino', 'home', 'Yacht Club Italiano', 'Portofino, Molo Umberto I', 44.30183, 9.21133, 'https://www.yachtclubitaliano.it', 'yci.svg'),

  C('crv-italia', 'twin', 'Circolo del Remo e della Vela Italia', 'Napoli, Banchina Santa Lucia', 40.8292, 14.2497, 'https://www.crvitalia.it', 'crv-italia.png'),
  C('cv-sicilia', 'twin', 'Circolo della Vela Sicilia', 'Mondello, Punta Celesi', 38.1977, 13.33554, 'https://www.circolodellavela.it', 'cv-sicilia.png'),
  C('compagnia-vela', 'twin', 'Compagnia della Vela', 'Venezia, San Marco', 45.4331, 12.33901, 'https://www.compagniadellavela.org', 'compagnia-vela.jpg'),
  C('tevere-remo', 'twin', 'Reale Circolo Canottieri Tevere Remo', 'Roma, Lungotevere', 41.93526, 12.48786, 'https://www.rcctevereremo.it', 'tevere-remo.png'),
  C('yc-adriaco', 'twin', 'Yacht Club Adriaco', 'Trieste, Molo Sartorio', 45.64698, 13.75986, 'https://www.ycadriaco.it', 'yc-adriaco.png'),
  C('rcn-barcelona', 'twin', 'Real Club Náutico de Barcelona', 'Barcellona, Moll d’Espanya', 41.37816, 2.18309, 'https://www.rcnb.com', 'rcn-barcelona.jpg'),
  C('cerea', 'twin', 'Reale Società Canottieri Cerea', 'Torino, sul Po', 45.0532, 7.68699, 'https://www.canottiericerea.it', 'cerea.png'),
  C('sn-geneve', 'twin', 'Société Nautique de Genève', 'Cologny, lago di Ginevra', 46.21289, 6.17292, 'https://www.nautique.ch', 'sn-geneve.png'),
  C('yc-france', 'twin', 'Yacht Club de France', 'Parigi, Avenue Foch', 48.87202, 2.28441, 'https://www.ycf-club.fr', 'yc-france.jpg'),
  C('yc-greece', 'twin', 'Yacht Club of Greece', 'Pireo, Mikrolimano', 37.93564, 23.65902, 'https://www.ycg.gr', 'yc-greece.png'),
  C('yc-monaco', 'twin', 'Yacht Club de Monaco', 'Monaco, Quai Louis II', 43.73747, 7.4279, 'https://www.yacht-club-monaco.mc', 'yc-monaco.png'),
  C('sn-saint-tropez', 'twin', 'Société Nautique de Saint-Tropez', 'Saint-Tropez, Quai Amiral Guépratte', 43.27002, 6.63371, 'https://www.societe-nautique-saint-tropez.fr', 'sn-saint-tropez.png'),

  C('yc-porto-rotondo', 'reciprocal', 'Yacht Club Porto Rotondo', 'Porto Rotondo', 41.02996, 9.54387, 'https://www.ycpr.it', 'yc-porto-rotondo.png'),
  C('yc-san-marino', 'reciprocal', 'Yacht Club San Marino', 'San Marino', 43.93639, 12.44669, 'https://www.facebook.com/YachtingclubSanMarino/', 'yc-san-marino.jpg', { approx: true }),
  C('cn-rimini', 'reciprocal', 'Club Nautico Rimini', 'Rimini, porto canale', 44.07532, 12.57453, 'https://www.cnrimini.com', 'cn-rimini.jpg'),
  C('cnv-argentario', 'reciprocal', 'Circolo Nautico e della Vela Argentario', 'Porto Ercole, Cala Galera', 42.4035, 11.2074, 'https://www.cnva.it', 'cnv-argentario.jpg'),
  C('cc-aniene', 'reciprocal', 'Circolo Canottieri Aniene', 'Roma, Lungotevere dell’Acqua Acetosa', 41.93297, 12.48204, 'https://www.ccaniene.com', 'cc-aniene.png'),
  C('sn-marseille', 'reciprocal', 'Société Nautique de Marseille', 'Marsiglia, Quai de Rive-Neuve', 43.29339, 5.36984, 'https://www.lanautique.com', 'sn-marseille.jpg'),
  C('cv-bari', 'reciprocal', 'Circolo della Vela di Bari', 'Bari, Lungomare Imperatore Augusto', 41.12655, 16.87332, 'https://www.circolodellavelabari.it', 'cv-bari.png'),
  C('rycc-savoia', 'reciprocal', 'Reale Yacht Club Canottieri Savoia', 'Napoli, Banchina Santa Lucia', 40.82963, 14.24909, 'https://www.ryccsavoia.it', 'rycc-savoia.png'),
  C('svbg', 'reciprocal', 'Società Velica di Barcola e Grignano', 'Trieste, Barcola', 45.67746, 13.75382, 'https://www.svbg.it', 'svbg.png'),
  C('gstaad-yc', 'reciprocal', 'Gstaad Yacht Club', 'Gstaad', 46.47216, 7.28875, 'https://www.gstaadyachtclub.com', 'gstaad-yc.png', { approx: true }),
  C('royal-malta-yc', 'reciprocal', 'Royal Malta Yacht Club', 'Ta’ Xbiex, Malta', 35.89765, 14.49986, 'https://www.rmyc.org', 'royal-malta-yc.jpg'),
  C('yc-la-maddalena', 'reciprocal', 'Yacht Club La Maddalena', 'La Maddalena, ex Arsenale (Moneta)', 41.2163, 9.43528, null, 'yc-la-maddalena.png'),
  C('yc-gaeta', 'reciprocal', 'Yacht Club Gaeta', 'Gaeta, Lungomare Caboto', 41.21424, 13.5736, 'https://www.yachtclubgaeta.it', 'yc-gaeta.png'),
]
