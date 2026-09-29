/**
 * Named character references recognised by the HTML diff (SPEC section 12.2): the 252 HTML 4.01
 * entities plus `apos`, as "name hexCodePoint" pairs. The PHP port (HtmlEntities.php) carries the
 * same data string. Names not in this table are not entities (the text is kept literally).
 */
const DATA =
  'AElig c6 Aacute c1 Acirc c2 Agrave c0 Alpha 391 Aring c5 Atilde c3 Auml c4 Beta 392 Ccedil c7 Chi ' +
  '3a7 Dagger 2021 Delta 394 ETH d0 Eacute c9 Ecirc ca Egrave c8 Epsilon 395 Eta 397 Euml cb Gamma 393 ' +
  'Iacute cd Icirc ce Igrave cc Iota 399 Iuml cf Kappa 39a Lambda 39b Mu 39c Ntilde d1 Nu 39d OElig ' +
  '152 Oacute d3 Ocirc d4 Ograve d2 Omega 3a9 Omicron 39f Oslash d8 Otilde d5 Ouml d6 Phi 3a6 Pi 3a0 ' +
  'Prime 2033 Psi 3a8 Rho 3a1 Scaron 160 Sigma 3a3 THORN de Tau 3a4 Theta 398 Uacute da Ucirc db ' +
  'Ugrave d9 Upsilon 3a5 Uuml dc Xi 39e Yacute dd Yuml 178 Zeta 396 aacute e1 acirc e2 acute b4 aelig ' +
  'e6 agrave e0 alefsym 2135 alpha 3b1 amp 26 and 2227 ang 2220 apos 27 aring e5 asymp 2248 atilde e3 ' +
  'auml e4 bdquo 201e beta 3b2 brvbar a6 bull 2022 cap 2229 ccedil e7 cedil b8 cent a2 chi 3c7 circ ' +
  '2c6 clubs 2663 cong 2245 copy a9 crarr 21b5 cup 222a curren a4 dArr 21d3 dagger 2020 darr 2193 deg ' +
  'b0 delta 3b4 diams 2666 divide f7 eacute e9 ecirc ea egrave e8 empty 2205 emsp 2003 ensp 2002 ' +
  'epsilon 3b5 equiv 2261 eta 3b7 eth f0 euml eb euro 20ac exist 2203 fnof 192 forall 2200 frac12 bd ' +
  'frac14 bc frac34 be frasl 2044 gamma 3b3 ge 2265 gt 3e hArr 21d4 harr 2194 hearts 2665 hellip 2026 ' +
  'iacute ed icirc ee iexcl a1 igrave ec image 2111 infin 221e int 222b iota 3b9 iquest bf isin 2208 ' +
  'iuml ef kappa 3ba lArr 21d0 lambda 3bb lang 2329 laquo ab larr 2190 lceil 2308 ldquo 201c le 2264 ' +
  'lfloor 230a lowast 2217 loz 25ca lrm 200e lsaquo 2039 lsquo 2018 lt 3c macr af mdash 2014 micro b5 ' +
  'middot b7 minus 2212 mu 3bc nabla 2207 nbsp a0 ndash 2013 ne 2260 ni 220b not ac notin 2209 nsub ' +
  '2284 ntilde f1 nu 3bd oacute f3 ocirc f4 oelig 153 ograve f2 oline 203e omega 3c9 omicron 3bf oplus ' +
  '2295 or 2228 ordf aa ordm ba oslash f8 otilde f5 otimes 2297 ouml f6 para b6 part 2202 permil 2030 ' +
  'perp 22a5 phi 3c6 pi 3c0 piv 3d6 plusmn b1 pound a3 prime 2032 prod 220f prop 221d psi 3c8 quot 22 ' +
  'rArr 21d2 radic 221a rang 232a raquo bb rarr 2192 rceil 2309 rdquo 201d real 211c reg ae rfloor ' +
  '230b rho 3c1 rlm 200f rsaquo 203a rsquo 2019 sbquo 201a scaron 161 sdot 22c5 sect a7 shy ad sigma ' +
  '3c3 sigmaf 3c2 sim 223c spades 2660 sub 2282 sube 2286 sum 2211 sup 2283 sup1 b9 sup2 b2 sup3 b3 ' +
  'supe 2287 szlig df tau 3c4 there4 2234 theta 3b8 thetasym 3d1 thinsp 2009 thorn fe tilde 2dc times ' +
  'd7 trade 2122 uArr 21d1 uacute fa uarr 2191 ucirc fb ugrave f9 uml a8 upsih 3d2 upsilon 3c5 uuml fc ' +
  'weierp 2118 xi 3be yacute fd yen a5 yuml ff zeta 3b6 zwj 200d zwnj 200c';
let table: Map<string, string> | null = null;

/** The decoded value of a named entity (without `&` and `;`), or undefined when unknown. */
export function namedEntity(name: string): string | undefined {
  if (!table) {
    table = new Map();
    const parts = DATA.split(' ');
    for (let i = 0; i + 1 < parts.length; i += 2) table.set(parts[i]!, String.fromCodePoint(parseInt(parts[i + 1]!, 16)));
  }
  return table.get(name);
}
