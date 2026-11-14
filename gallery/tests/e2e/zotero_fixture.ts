import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

/** Notice synthétique de la bibliothèque factice. */
export type FakeItem = {id: number; key: string; title: string; year: string; journal: string; authors: [string, string][]};

export const ITEMS: FakeItem[] = [
  {id: 10, key: 'WILL2021', title: 'The influence of forest fire aerosol and air temperature on glacier albedo, western North America', year: '2021', journal: 'Remote Sensing of Environment', authors: [['Scott N.', 'Williamson'], ['Brian', 'Menounos']]},
  {id: 11, key: 'AUBR2022', title: 'Fire and ice: the impact of wildfire-affected albedo and irradiance on glacier melt', year: '2022', journal: "Earth's Future", authors: [['Caroline', 'Aubry-Wake'], ['André', 'Bertoncini'], ['John W.', 'Pomeroy']]},
  {id: 12, key: 'WILL2020', title: 'Evaluating snow and ice albedo from MODIS over glaciers of the Saint Elias Mountains', year: '2020', journal: 'Remote Sensing of Environment', authors: [['Scott N.', 'Williamson'], ['Luke', 'Copland'], ['Laura', 'Thomson']]},
];

const style = (id: string, title: string, format: string) => `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0"><info><title>${title}</title><id>http://www.zotero.org/styles/${id}</id><category citation-format="${format}"/></info></style>`;

/** Dossier Zotero factice : zotero.sqlite (tables que lisent la galerie et
 *  atelier-cite) et deux styles CSL installés. */
export function makeZotero(dir: string, items: FakeItem[] = ITEMS): string {
  mkdirSync(path.join(dir, 'styles'), {recursive: true});
  writeFileSync(path.join(dir, 'styles', 'apa.csl'), style('apa', 'American Psychological Association 7th edition', 'author-date'));
  writeFileSync(path.join(dir, 'styles', 'ieee.csl'), style('ieee', 'IEEE', 'numeric'));
  const db = new DatabaseSync(path.join(dir, 'zotero.sqlite'));
  db.exec(`
    CREATE TABLE itemTypes (itemTypeID INTEGER, typeName TEXT);
    CREATE TABLE items (itemID INTEGER, itemTypeID INTEGER, libraryID INTEGER, key TEXT, dateAdded TEXT, dateModified TEXT);
    CREATE TABLE deletedItems (itemID INTEGER);
    CREATE TABLE fields (fieldID INTEGER, fieldName TEXT);
    CREATE TABLE itemDataValues (valueID INTEGER, value);
    CREATE TABLE itemData (itemID INTEGER, fieldID INTEGER, valueID INTEGER);
    CREATE TABLE creators (creatorID INTEGER, firstName TEXT, lastName TEXT, fieldMode INTEGER);
    CREATE TABLE creatorTypes (creatorTypeID INTEGER, creatorType TEXT);
    CREATE TABLE itemCreators (itemID INTEGER, creatorID INTEGER, creatorTypeID INTEGER, orderIndex INTEGER);
    CREATE TABLE groups (groupID INTEGER, libraryID INTEGER);
    CREATE TABLE settings (setting TEXT, key TEXT, value);
    CREATE TABLE tags (tagID INTEGER, name TEXT);
    CREATE TABLE itemTags (itemID INTEGER, tagID INTEGER);
    CREATE TABLE itemAttachments (itemID INTEGER, parentItemID INTEGER, contentType TEXT, path TEXT);
    CREATE TABLE collectionItems (collectionID INTEGER, itemID INTEGER);
    CREATE TABLE collections (collectionID INTEGER, collectionName TEXT, parentCollectionID INTEGER, key TEXT, libraryID INTEGER);
    INSERT INTO itemTypes VALUES (1, 'journalArticle'), (2, 'attachment');
    INSERT INTO fields VALUES (1, 'title'), (2, 'date'), (3, 'publicationTitle');
    INSERT INTO creatorTypes VALUES (1, 'author');
    INSERT INTO settings VALUES ('account', 'localUserKey', 'abcd1234');
  `);
  let value = 1, creator = 1;
  for (const it of items) {
    db.prepare('INSERT INTO items VALUES (?, 1, 1, ?, ?, ?)').run(it.id, it.key, `${it.year}-01-01 00:00:00`, `${it.year}-01-0${it.id % 9} 00:00:00`);
    for (const [field, v] of [[1, it.title], [2, `${it.year}-00-00 ${it.year}`], [3, it.journal]] as [number, string][]) {
      db.prepare('INSERT INTO itemDataValues VALUES (?, ?)').run(value, v);
      db.prepare('INSERT INTO itemData VALUES (?, ?, ?)').run(it.id, field, value++);
    }
    it.authors.forEach(([given, family], k) => {
      db.prepare('INSERT INTO creators VALUES (?, ?, ?, 0)').run(creator, given, family);
      db.prepare('INSERT INTO itemCreators VALUES (?, ?, 1, ?)').run(it.id, creator++, k);
    });
  }
  db.close();
  return dir;
}
