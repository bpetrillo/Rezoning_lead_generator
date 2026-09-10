/**
 * Maps a municipality name to its state — needed because the database has no
 * dedicated state column (every town was NC until Rock Hill, the first South Carolina
 * town, was added), and the UI was hardcoding ", NC" everywhere as a result.
 *
 * Defaults to 'NC' for anything not explicitly listed — safe for now since NC towns
 * are still the large majority, but every new South Carolina (or other) town added to
 * this project needs an entry here too, or it'll silently show the wrong state.
 *
 * CONFIRMED LIVE BUG: York and Tega Cay were both missed when they were first added —
 * only Rock Hill was in this list, so both silently showed ", NC" until caught.
 */
const STATE_BY_MUNICIPALITY = {
  'Rock Hill': 'SC',
  'Tega Cay': 'SC',
  'York': 'SC',
  // Add future SC towns here as they're built: Fort Mill, Lancaster, Chester,
  // Gaffney, Chesterfield, Union (SC), etc.
}

export function getStateForMunicipality(municipality) {
  return STATE_BY_MUNICIPALITY[municipality] || 'NC'
}
