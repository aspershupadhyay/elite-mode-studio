export const FONT_REGISTRY = [
  { family:'Inter',               category:'Sans Serif',  weights:[300,400,500,600,700,800,900] },
  { family:'Outfit',              category:'Sans Serif',  weights:[300,400,500,600,700,800,900] },
  { family:'Poppins',             category:'Sans Serif',  weights:[300,400,500,600,700,800,900] },
  { family:'Montserrat',          category:'Sans Serif',  weights:[300,400,500,600,700,800,900] },
  { family:'Roboto',              category:'Sans Serif',  weights:[300,400,500,700,900] },
  { family:'Open Sans',           category:'Sans Serif',  weights:[300,400,500,600,700,800] },
  { family:'Lato',                category:'Sans Serif',  weights:[300,400,700,900] },
  { family:'Nunito',              category:'Sans Serif',  weights:[300,400,500,600,700,800,900] },
  { family:'Raleway',             category:'Sans Serif',  weights:[300,400,500,600,700,800,900] },
  { family:'Work Sans',           category:'Sans Serif',  weights:[300,400,500,600,700,800,900] },
  { family:'DM Sans',             category:'Sans Serif',  weights:[400,500,700] },
  { family:'Manrope',             category:'Sans Serif',  weights:[300,400,500,600,700,800] },
  { family:'Plus Jakarta Sans',   category:'Sans Serif',  weights:[300,400,500,600,700,800] },
  { family:'Space Grotesk',       category:'Sans Serif',  weights:[300,400,500,600,700] },
  { family:'Sora',                category:'Sans Serif',  weights:[300,400,500,600,700,800] },
  { family:'Geist',               category:'Sans Serif',  weights:[300,400,500,600,700,800,900] },
  { family:'Rubik',               category:'Sans Serif',  weights:[300,400,500,600,700,800,900] },
  { family:'Bebas Neue',          category:'Display',     weights:[400] },
  { family:'Oswald',              category:'Display',     weights:[300,400,500,600,700] },
  { family:'Anton',               category:'Display',     weights:[400] },
  { family:'Righteous',           category:'Display',     weights:[400] },
  { family:'Black Ops One',       category:'Display',     weights:[400] },
  { family:'Russo One',           category:'Display',     weights:[400] },
  { family:'Orbitron',            category:'Display',     weights:[400,500,600,700,800,900] },
  { family:'Chakra Petch',        category:'Display',     weights:[300,400,500,600,700] },
  { family:'Big Shoulders Display',category:'Display',    weights:[300,400,500,600,700,800,900] },
  { family:'Archivo Black',       category:'Display',     weights:[400] },
  { family:'Bungee',              category:'Display',     weights:[400] },
  { family:'Playfair Display',    category:'Serif',       weights:[400,500,600,700,800,900] },
  { family:'Merriweather',        category:'Serif',       weights:[300,400,700,900] },
  { family:'Lora',                category:'Serif',       weights:[400,500,600,700] },
  { family:'Cormorant Garamond',  category:'Serif',       weights:[300,400,500,600,700] },
  { family:'DM Serif Display',    category:'Serif',       weights:[400] },
  { family:'Fraunces',            category:'Serif',       weights:[300,400,500,600,700,800,900] },
  { family:'EB Garamond',         category:'Serif',       weights:[400,500,600,700,800] },
  { family:'JetBrains Mono',      category:'Monospace',   weights:[400,500,600,700,800] },
  { family:'Fira Code',           category:'Monospace',   weights:[300,400,500,600,700] },
  { family:'Source Code Pro',     category:'Monospace',   weights:[300,400,500,600,700,800,900] },
  { family:'Space Mono',          category:'Monospace',   weights:[400,700] },
  { family:'Caveat',              category:'Handwriting', weights:[400,500,600,700] },
  { family:'Pacifico',            category:'Handwriting', weights:[400] },
  { family:'Dancing Script',      category:'Handwriting', weights:[400,500,600,700] },
  { family:'Permanent Marker',    category:'Handwriting', weights:[400] },
  { family:'Sacramento',          category:'Handwriting', weights:[400] },
  { family:'Satisfy',             category:'Handwriting', weights:[400] },
]

export const FONT_CATEGORIES = ['Sans Serif','Display','Serif','Monospace','Handwriting']

const loadedFonts = new Set()

export function loadGoogleFont(family) {
  if (loadedFonts.has(family)) return
  loadedFonts.add(family)
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@100;200;300;400;500;600;700;800;900&display=swap`
  const link = document.createElement('link')
  link.rel = 'stylesheet'; link.href = url
  document.head.appendChild(link)
}

export function preloadPopularFonts() {
  ['Inter','Poppins','Montserrat','Bebas Neue','Playfair Display',
   'Oswald','Outfit','DM Sans','Space Grotesk','Roboto'].forEach(loadGoogleFont)
}
