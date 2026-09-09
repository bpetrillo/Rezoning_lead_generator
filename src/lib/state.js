/**
 * Maps a municipality name to its state — needed because the database has no
 * dedicated state column (every town was NC until Rock Hill, the first South Carolina
 * town, was added), and the UI was hardcoding ", NC" everywhere as a result.
 *
 * Defaults to 'NC' for anything not explicitly listed — safe for now since NC towns
 * are still the large majority, but every new South Carolina (or other) town added to
 * this project needs an entry here too, or it'll silently show the wrong state.
 */
const STATE_BY_MUNICIPALITY = {
  'Rock Hill': 'SC',
  // Add future SC towns here as they're built: York, Fort Mill, Tega Cay, Lancaster,
  // Chester, Gaffney, Chesterfield, Union (SC), etc.
}

export function getStateForMunicipality(municipality) {
  return STATE_BY_MUNICIPALITY[municipality] || 'NC'
}
