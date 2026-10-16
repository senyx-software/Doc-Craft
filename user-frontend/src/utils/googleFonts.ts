/* ============================================
   Font catalog for the Builder's typography controls.
   `system: true` entries are OS/licensed fonts (Arial, Helvetica Neue,
   Canva Sans, etc.) that aren't on Google Fonts — they're selectable and
   rendered with a plain CSS font-family (falling back to the browser/OS
   default if not actually installed), but never trigger a network fetch.
   Everything else is lazy-loaded via loadGoogleFont() only once actually
   selected, since eagerly loading 250+ font files would be a serious
   performance regression.
   ============================================ */

export interface FontOption {
  family: string;
  system?: boolean;
}

export interface FontCategory {
  label: string;
  fonts: FontOption[];
}

const g = (family: string): FontOption => ({ family });
const s = (family: string): FontOption => ({ family, system: true });

export const FONT_CATEGORIES: FontCategory[] = [
  {
    label: 'Sans Serif',
    fonts: [
      g('Inter'), g('Montserrat'), g('Poppins'), g('Open Sans'), g('Roboto'), g('Lato'), g('Raleway'),
      g('Nunito'), g('Nunito Sans'), g('Work Sans'), g('Karla'), g('Rubik'), g('Mulish'), g('DM Sans'),
      g('Manrope'), g('Jost'), g('Quicksand'), g('Josefin Sans'), g('Barlow'), g('Archivo'), g('Oswald'),
      g('PT Sans'), g('Source Sans Pro'), g('Noto Sans'), g('Fira Sans'), g('Cabin'), g('Muli'),
      g('Overpass'), g('Hind'), g('Heebo'), g('Assistant'), g('Titillium Web'), g('Exo'), g('Exo 2'),
      g('Saira'), g('IBM Plex Sans'), g('Red Hat Display'), g('Sora'), g('Outfit'), g('Urbanist'),
      g('Plus Jakarta Sans'), g('Figtree'), g('Epilogue'), g('Space Grotesk'), g('Public Sans'),
      g('Lexend'), g('Be Vietnam Pro'), g('Chivo'), g('Prompt'), g('Kanit'), g('Maven Pro'),
      g('Varela Round'), g('Comfortaa'), g('Questrial'), g('Didact Gothic'), g('League Spartan'),
      g('Grandstander'), g('Bricolage Grotesque'), g('Syne'), g('Abel'), g('Actor'), g('Advent Pro'),
      g('Asap'), g('Asul'), g('Cairo'), g('Catamaran'), g('Dosis'), g('Encode Sans'), g('Gothic A1'),
      g('Khand'), g('Kumbh Sans'), g('Libre Franklin'), g('Numans'), g('Oxygen'), g('Ropa Sans'),
      g('Signika'), g('Tenor Sans'), g('Varta'), g('Yantramanav'),
      s('Century Gothic'), s('Futura PT'), s('Helvetica Neue'), s('Proxima Nova'), s('Gotham'),
      s('Avenir'), s('Brandon Grotesque'), s('Canva Sans'), s('Segoe UI'), s('Calibri'), s('Arial'),
      s('Verdana'), s('Tahoma'), s('Circular Std'),
    ],
  },
  {
    label: 'Serif',
    fonts: [
      g('Playfair Display'), g('Merriweather'), g('Lora'), g('PT Serif'), g('Cormorant'),
      g('Cormorant Garamond'), g('Crimson Text'), g('Crimson Pro'), g('Libre Baskerville'), g('Bitter'),
      g('Domine'), g('EB Garamond'), g('Source Serif Pro'), g('Noto Serif'), g('Zilla Slab'),
      g('Rokkitt'), g('Vollkorn'), g('Alegreya'), g('Alegreya Sans'), g('Frank Ruhl Libre'),
      g('Spectral'), g('Cardo'), g('Old Standard TT'), g('Prata'), g('Marcellus'), g('Cinzel'),
      g('Cinzel Decorative'), g('Abril Fatface'), g('Rozha One'), g('Yeseva One'), g('Fraunces'),
      g('Bodoni Moda'), g('Josefin Slab'), g('IBM Plex Serif'), g('Antic Slab'), g('Neuton'),
      g('Gelasio'), g('Faustina'), g('Arvo'), g('Slabo 27px'), g('Roboto Slab'), g('Aleo'), g('Amiri'),
      g('DM Serif Display'), g('DM Serif Text'), g('Libre Caslon Text'), g('Cormorant Upright'),
      g('Playfair Display SC'), g('Lustria'), g('Vidaloka'), g('Unna'), g('Volkhov'),
      s('Baskerville'), s('Georgia'), s('Garamond'), s('Times New Roman'), s('Trajan Pro'), s('Didot'),
      s('Butler'), s('Canela'),
    ],
  },
  {
    label: 'Display / Bold Headline',
    fonts: [
      g('Righteous'), g('Fjalla One'), g('Passion One'), g('Bangers'), g('Luckiest Guy'),
      g('Fredoka One'), g('Fredoka'), g('Baloo 2'), g('Chewy'), g('Titan One'), g('Boogaloo'),
      g('Alfa Slab One'), g('Bungee'), g('Bungee Shade'), g('Bungee Inline'), g('Bungee Hairline'),
      g('Monoton'), g('Staatliches'), g('Archivo Black'), g('Krona One'), g('Rammetto One'),
      g('Shrikhand'), g('Modak'), g('Bowlby One'), g('Sigmar One'), g('Concert One'), g('Bahiana'),
      g('Bevan'), g('Passero One'), g('Rye'), g('Special Elite'), g('Nabla'), g('Fascinate'),
      g('Wallpoet'), g('Faster One'), g('Big Shoulders Display'), g('Anton'), g('Bebas Neue'),
      g('Coiny'), g('Baloo Bhaijaan'), g('Poetsen One'), g('Chango'), g('Racing Sans One'),
      s('Impact'), s('Comic Sans MS'),
    ],
  },
  {
    label: 'Script / Handwriting',
    fonts: [
      g('Pacifico'), g('Dancing Script'), g('Great Vibes'), g('Sacramento'), g('Satisfy'), g('Caveat'),
      g('Kalam'), g('Shadows Into Light'), g('Shadows Into Light Two'), g('Amatic SC'),
      g('Permanent Marker'), g('Indie Flower'), g('Homemade Apple'), g('Allura'), g('Alex Brush'),
      g('Parisienne'), g('Tangerine'), g('Petit Formal Script'), g('Yellowtail'), g('Cookie'),
      g('Courgette'), g('Kaushan Script'), g('Lobster'), g('Lobster Two'), g('Handlee'),
      g('Marck Script'), g('Mr Dafoe'), g('Norican'), g('Pinyon Script'), g('Playball'), g('Rochester'),
      g('Rouge Script'), g('Ruthie'), g('Sail'), g('Stalemate'), g('Herr Von Muellerhoff'),
      g('Italianno'), g('Meddon'), g('Mrs Saint Delafield'), g('Windsong'), g('Bilbo'), g('Charm'),
      g('Comforter'), g('Damion'), g('Dawning of a New Day'), g('Grand Hotel'), g('Miss Fajardose'),
      g('Give You Glory'), g('Waiting for the Sunrise'), g('Zeyada'), g('Patrick Hand'),
      g('Architects Daughter'), g('Gochi Hand'), g('Gloria Hallelujah'), g('Reenie Beanie'),
      g('Schoolbell'), g('Covered By Your Grace'), g('Just Another Hand'), g('Delius'),
      g('Nanum Pen Script'), g('Merienda'),
    ],
  },
  {
    label: 'Monospace',
    fonts: [
      g('Space Mono'), g('Roboto Mono'), g('IBM Plex Mono'), g('JetBrains Mono'), g('Source Code Pro'),
      g('Courier Prime'), g('Inconsolata'), g('PT Mono'), g('Fira Code'), g('Cousine'),
      g('Overpass Mono'), g('Ubuntu Mono'), g('VT323'), g('Major Mono Display'), g('Anonymous Pro'),
    ],
  },
  {
    label: 'Slab / Condensed / Special',
    fonts: [
      g('Yanone Kaffeesatz'), g('Squada One'), g('PT Sans Narrow'), g('Barlow Condensed'),
      g('Saira Condensed'), g('Archivo Narrow'), g('Big Shoulders Text'), g('Teko'), g('Aldrich'),
      g('Orbitron'), g('Audiowide'), g('Michroma'), g('Electrolize'), g('Bai Jamjuree'), g('Play'),
      g('Voltaire'), g('Hepta Slab'), g('Kreon'), g('Podkova'), g('Trirong'), g('BioRhyme'),
      g('Cabin Sketch'), g('Days One'), g('Akronim'), g('Amiko'), g('Antic'), g('Aref Ruqaa'),
      g('Judson'), g('Lalezar'), g('Marmelad'), g('Molengo'), g('Montaga'), g('Pathway Gothic One'),
      g('Petrona'), g('Sanchez'), g('Zen Loop'),
    ],
  },
];

export const ALL_FONTS: FontOption[] = FONT_CATEGORIES.flatMap((c) => c.fonts);

const loadedFonts = new Set<string>();

// Injects a Google Fonts stylesheet <link> for `family` the first time it's
// actually selected — never called eagerly for the whole catalog.
export function loadGoogleFont(family: string): void {
  const font = ALL_FONTS.find((f) => f.family === family);
  if (!font || font.system || loadedFonts.has(family)) return;
  loadedFonts.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@300;400;500;600;700;800&display=swap`;
  document.head.appendChild(link);
}
