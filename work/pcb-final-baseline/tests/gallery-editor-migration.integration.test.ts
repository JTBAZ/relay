import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { describe, it, expect } from "vitest";

const url=process.env.GALLERY_EDITOR_TEST_DATABASE_URL;
if(url&&!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw new Error('Explicit local test database required');
describe.skipIf(!url)('Gallery naming populated legacy migration',()=>{
  it('preserves displayed names and stable relationships while enforcing row-local title modes',async()=>{
    const db=new Client({connectionString:url}),schema=`ce_migration_${randomUUID().replaceAll('-','')}`;
    await db.connect();
    try{
      // A disposable schema isolates the actual migrations from the running app.
      await db.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}"`);
      await db.query(`CREATE TABLE posts (id text PRIMARY KEY,creator_id text NOT NULL, source_title text);
        CREATE TABLE creative_works (id text PRIMARY KEY,creator_id text NOT NULL,title text);
        CREATE TABLE creative_work_members (id text PRIMARY KEY,creator_id text NOT NULL,creative_work_id text REFERENCES creative_works(id),post_id text UNIQUE REFERENCES posts(id));
        CREATE TABLE post_presentations (id text PRIMARY KEY,creator_id text NOT NULL,post_id text UNIQUE REFERENCES posts(id),relay_title text);
        INSERT INTO posts VALUES ('a','owner','Source A'),('b','owner','Source B'),('c','owner','Source C');
        INSERT INTO creative_works VALUES ('w','owner','Legacy family');
        INSERT INTO creative_work_members VALUES ('ma','owner','w','a'),('mb','owner','w','b');`);
      await db.query('INSERT INTO post_presentations VALUES ($1,$2,$3,$4),($5,$2,$6,$7),($8,$2,$9,NULL)', ['pa','owner','a','  Custom title  ','pb','b','\u00a0\ufeff','pc','c']);
      const before=await db.query('SELECT p.id,p.source_title,pp.relay_title FROM posts p LEFT JOIN post_presentations pp ON pp.post_id=p.id ORDER BY p.id');
      for(const directory of ['20261011010000_gallery_editor_naming','20261011020000_gallery_editor_title_validity'])await db.query(await readFile(`prisma/migrations/${directory}/migration.sql`,'utf8'));
      const after=await db.query('SELECT p.id,p.source_title,pp.relay_title,pp.title_mode FROM posts p LEFT JOIN post_presentations pp ON pp.post_id=p.id ORDER BY p.id');
      const display=(r:{relay_title:string|null;source_title:string})=>r.relay_title?.trim()?r.relay_title:r.source_title;
      expect(after.rows.map(display)).toEqual(before.rows.map(display));
      expect(after.rows.map(r=>r.title_mode)).toEqual(['custom','source','source']);
      expect((await db.query('SELECT title,title_mode FROM creative_works')).rows).toEqual([{title:'Legacy family',title_mode:'independent'}]);
      expect((await db.query('SELECT id,post_id,creative_work_id FROM creative_work_members ORDER BY id')).rows).toEqual([{id:'ma',post_id:'a',creative_work_id:'w'},{id:'mb',post_id:'b',creative_work_id:'w'}]);
      await expect(db.query("UPDATE post_presentations SET title_mode='source' WHERE post_id='a'")).rejects.toMatchObject({code:'23514'});
      await expect(db.query("UPDATE post_presentations SET title_mode='custom',relay_title='' WHERE post_id='b'")).rejects.toMatchObject({code:'23514'});
      await expect(db.query("INSERT INTO creative_work_members VALUES ('foreign','other','w','c')")).rejects.toMatchObject({code:'23503'});
    }finally{await db.query('ROLLBACK');await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await db.end();}
  });
});
