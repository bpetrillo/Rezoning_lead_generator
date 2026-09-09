/**
 * Maps a municipality name to its state — needed because scraped addresses often
 * don't include a state (or even a city), and geocode.js needs to append the correct
 * one for the geocoder to resolve the right location. Every town was NC until Rock
 * Hill, the first South Carolina town, was added — confirmed live this was a real
 * bug: geocodeRecords() was hardcoding ", NC" for every town's street-only addresses,
 * meaning Rock Hill's actual geocoding requests went out with the wrong state.
 *
 * This is a duplicate of src/lib/state.js (same content) rather than a shared import,
 * since this project's frontend (src/, Vite-bundled) and scrapers (scrapers/, plain
 * Node scripts) are separate module contexts without a straightforward way to share a
 * single file between them. Keep both files in sync when adding a new state.
 *
 * Defaults to 'NC' for anything not explicitly listed — safe for now since NC towns
 * are still the large majority, but every new South Carolina (or other) town added to
 * this project needs an entry here too, or its addresses will be geocoded with the
 * wrong state.
 */
const STATE_BY_MUNICIPALITY = {
  'Rock Hill': 'SC',
  // Add future SC towns here as they're built: York, Fort Mill, Tega Cay, Lancaster,
  // Chester, Gaffney, Chesterfield, Union (SC), etc.
}

export function getStateForMunicipality(municipality) {
  return STATE_BY_MUNICIPALITY[municipality] || 'NC'
}
