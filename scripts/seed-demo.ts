/**
 * Builds a fake Audiobookshelf database (same tables/columns ABS uses) filled with
 * a few years of believable family listening, so the app can be developed and
 * demoed without touching a real server.
 *
 *   npm run seed:demo            -> ./data/demo-absdatabase.sqlite
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const out = path.resolve(process.argv[2] ?? './data/demo-absdatabase.sqlite')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.rmSync(out, { force: true })
const db = new DatabaseSync(out)

// Deterministic randomness so the demo looks the same every time.
let seed = 42
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand())
const uuid = () => crypto.randomUUID()
const ts = (ms: number) => new Date(ms).toISOString().replace('T', ' ').replace('Z', ' +00:00')

db.exec(`
CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, email TEXT, pash TEXT, type TEXT, token TEXT, isActive INTEGER, isLocked INTEGER, lastSeen TEXT, permissions TEXT, bookmarks TEXT, extraData TEXT, createdAt TEXT, updatedAt TEXT);
CREATE TABLE libraries (id TEXT PRIMARY KEY, name TEXT, displayOrder INTEGER, icon TEXT, mediaType TEXT, provider TEXT, settings TEXT, extraData TEXT, createdAt TEXT, updatedAt TEXT);
CREATE TABLE libraryItems (id TEXT PRIMARY KEY, ino TEXT, path TEXT, relPath TEXT, mediaId TEXT, mediaType TEXT, isFile INTEGER, isMissing INTEGER, isInvalid INTEGER, size INTEGER, title TEXT, libraryId TEXT, createdAt TEXT, updatedAt TEXT);
CREATE TABLE books (id TEXT PRIMARY KEY, title TEXT, titleIgnorePrefix TEXT, subtitle TEXT, publishedYear TEXT, publishedDate TEXT, publisher TEXT, description TEXT, isbn TEXT, asin TEXT, language TEXT, explicit INTEGER, abridged INTEGER, coverPath TEXT, duration REAL, narrators TEXT, audioFiles TEXT, ebookFile TEXT, chapters TEXT, tags TEXT, genres TEXT, createdAt TEXT, updatedAt TEXT);
CREATE TABLE authors (id TEXT PRIMARY KEY, name TEXT, lastFirst TEXT, asin TEXT, description TEXT, imagePath TEXT, libraryId TEXT, createdAt TEXT, updatedAt TEXT);
CREATE TABLE bookAuthors (id TEXT PRIMARY KEY, bookId TEXT, authorId TEXT, createdAt TEXT);
CREATE TABLE series (id TEXT PRIMARY KEY, name TEXT, nameIgnorePrefix TEXT, description TEXT, libraryId TEXT, createdAt TEXT, updatedAt TEXT);
CREATE TABLE bookSeries (id TEXT PRIMARY KEY, sequence TEXT, bookId TEXT, seriesId TEXT, createdAt TEXT);
CREATE TABLE podcasts (id TEXT PRIMARY KEY, title TEXT, author TEXT, genres TEXT, numEpisodes INTEGER, createdAt TEXT, updatedAt TEXT);
CREATE TABLE podcastEpisodes (id TEXT PRIMARY KEY, podcastId TEXT, "index" INTEGER, title TEXT, audioFile TEXT, createdAt TEXT, updatedAt TEXT);
CREATE TABLE devices (id TEXT PRIMARY KEY, deviceId TEXT, clientName TEXT, clientVersion TEXT, ipAddress TEXT, deviceName TEXT, deviceVersion TEXT, extraData TEXT, userId TEXT, createdAt TEXT, updatedAt TEXT);
CREATE TABLE playbackSessions (id TEXT PRIMARY KEY, mediaItemId TEXT, mediaItemType TEXT, displayTitle TEXT, displayAuthor TEXT, duration REAL, playMethod INTEGER, mediaPlayer TEXT, startTime REAL, currentTime REAL, serverVersion TEXT, coverPath TEXT, timeListening INTEGER, mediaMetadata TEXT, date TEXT, dayOfWeek TEXT, extraData TEXT, userId TEXT, deviceId TEXT, libraryId TEXT, createdAt TEXT, updatedAt TEXT);
CREATE TABLE mediaProgresses (id TEXT PRIMARY KEY, mediaItemId TEXT, mediaItemType TEXT, duration REAL, currentTime REAL, isFinished INTEGER, hideFromContinueListening INTEGER, ebookLocation TEXT, ebookProgress REAL, finishedAt TEXT, extraData TEXT, podcastId TEXT, userId TEXT, createdAt TEXT, updatedAt TEXT);
`)

// ------------------------------------------------------------ catalog
// [title, author, narrator, series, seq, genres, year, hours]
type Row = [string, string, string, string | null, string | null, string[], number, number]
const CATALOG: Row[] = [
  ['Project Hail Mary', 'Andy Weir', 'Ray Porter', null, null, ['Science Fiction'], 2021, 16.2],
  ['The Martian', 'Andy Weir', 'R. C. Bray', null, null, ['Science Fiction'], 2011, 10.9],
  ['Artemis', 'Andy Weir', 'Rosario Dawson', null, null, ['Science Fiction'], 2017, 8.9],
  ['Dune', 'Frank Herbert', 'Scott Brick', 'Dune', '1', ['Science Fiction', 'Classics'], 1965, 21.1],
  ['Dune Messiah', 'Frank Herbert', 'Scott Brick', 'Dune', '2', ['Science Fiction', 'Classics'], 1969, 8.9],
  ['Children of Dune', 'Frank Herbert', 'Scott Brick', 'Dune', '3', ['Science Fiction', 'Classics'], 1976, 15.8],
  ['Leviathan Wakes', 'James S. A. Corey', 'Jefferson Mays', 'The Expanse', '1', ['Science Fiction'], 2011, 20.9],
  ["Caliban's War", 'James S. A. Corey', 'Jefferson Mays', 'The Expanse', '2', ['Science Fiction'], 2012, 20.9],
  ["Abaddon's Gate", 'James S. A. Corey', 'Jefferson Mays', 'The Expanse', '3', ['Science Fiction'], 2013, 19.5],
  ['The Way of Kings', 'Brandon Sanderson', 'Michael Kramer', 'The Stormlight Archive', '1', ['Fantasy'], 2010, 45.5],
  ['Words of Radiance', 'Brandon Sanderson', 'Michael Kramer', 'The Stormlight Archive', '2', ['Fantasy'], 2014, 48.3],
  ['Oathbringer', 'Brandon Sanderson', 'Michael Kramer', 'The Stormlight Archive', '3', ['Fantasy'], 2017, 55.1],
  ['Mistborn: The Final Empire', 'Brandon Sanderson', 'Michael Kramer', 'Mistborn', '1', ['Fantasy'], 2006, 24.6],
  ['The Well of Ascension', 'Brandon Sanderson', 'Michael Kramer', 'Mistborn', '2', ['Fantasy'], 2007, 28.8],
  ['The Hero of Ages', 'Brandon Sanderson', 'Michael Kramer', 'Mistborn', '3', ['Fantasy'], 2008, 27.6],
  ['Tress of the Emerald Sea', 'Brandon Sanderson', 'Michael Kramer', null, null, ['Fantasy'], 2023, 11.2],
  ['The Name of the Wind', 'Patrick Rothfuss', 'Nick Podehl', 'The Kingkiller Chronicle', '1', ['Fantasy'], 2007, 27.9],
  ["The Wise Man's Fear", 'Patrick Rothfuss', 'Nick Podehl', 'The Kingkiller Chronicle', '2', ['Fantasy'], 2011, 42.9],
  ['Dungeon Crawler Carl', 'Matt Dinniman', 'Jeff Hays', 'Dungeon Crawler Carl', '1', ['Fantasy', 'LitRPG', 'Humor'], 2020, 13.7],
  ["Carl's Doomsday Scenario", 'Matt Dinniman', 'Jeff Hays', 'Dungeon Crawler Carl', '2', ['Fantasy', 'LitRPG', 'Humor'], 2021, 14.5],
  ['The Dungeon Anarchist\'s Cookbook', 'Matt Dinniman', 'Jeff Hays', 'Dungeon Crawler Carl', '3', ['Fantasy', 'LitRPG', 'Humor'], 2021, 16.9],
  ['The Hobbit', 'J. R. R. Tolkien', 'Andy Serkis', null, null, ['Fantasy', 'Classics'], 1937, 10.4],
  ['The Fellowship of the Ring', 'J. R. R. Tolkien', 'Andy Serkis', 'The Lord of the Rings', '1', ['Fantasy', 'Classics'], 1954, 22.6],
  ['The Two Towers', 'J. R. R. Tolkien', 'Andy Serkis', 'The Lord of the Rings', '2', ['Fantasy', 'Classics'], 1954, 18.7],
  ['The Return of the King', 'J. R. R. Tolkien', 'Andy Serkis', 'The Lord of the Rings', '3', ['Fantasy', 'Classics'], 1955, 17.8],
  ["Harry Potter and the Sorcerer's Stone", 'J. K. Rowling', 'Jim Dale', 'Harry Potter', '1', ['Fantasy', 'Young Adult'], 1997, 8.3],
  ['Harry Potter and the Chamber of Secrets', 'J. K. Rowling', 'Jim Dale', 'Harry Potter', '2', ['Fantasy', 'Young Adult'], 1998, 9.2],
  ['Harry Potter and the Prisoner of Azkaban', 'J. K. Rowling', 'Jim Dale', 'Harry Potter', '3', ['Fantasy', 'Young Adult'], 1999, 11.8],
  ['Harry Potter and the Goblet of Fire', 'J. K. Rowling', 'Jim Dale', 'Harry Potter', '4', ['Fantasy', 'Young Adult'], 2000, 20.8],
  ['Percy Jackson: The Lightning Thief', 'Rick Riordan', 'Jesse Bernstein', 'Percy Jackson', '1', ['Fantasy', 'Young Adult'], 2005, 10.0],
  ['Percy Jackson: The Sea of Monsters', 'Rick Riordan', 'Jesse Bernstein', 'Percy Jackson', '2', ['Fantasy', 'Young Adult'], 2006, 7.8],
  ['Percy Jackson: The Titan\'s Curse', 'Rick Riordan', 'Jesse Bernstein', 'Percy Jackson', '3', ['Fantasy', 'Young Adult'], 2007, 8.4],
  ['Wonder', 'R. J. Palacio', 'Diana Steele', null, null, ['Young Adult', 'Fiction'], 2012, 8.1],
  ['The Hunger Games', 'Suzanne Collins', 'Tatiana Maslany', 'The Hunger Games', '1', ['Young Adult', 'Science Fiction'], 2008, 11.0],
  ['Catching Fire', 'Suzanne Collins', 'Tatiana Maslany', 'The Hunger Games', '2', ['Young Adult', 'Science Fiction'], 2009, 11.6],
  ['Mockingjay', 'Suzanne Collins', 'Tatiana Maslany', 'The Hunger Games', '3', ['Young Adult', 'Science Fiction'], 2010, 11.8],
  ['Gone Girl', 'Gillian Flynn', 'Julia Whelan', null, null, ['Thriller', 'Mystery'], 2012, 19.2],
  ['The Silent Patient', 'Alex Michaelides', 'Jack Hawkins', null, null, ['Thriller', 'Mystery'], 2019, 8.7],
  ['The Thursday Murder Club', 'Richard Osman', 'Lesley Manville', 'Thursday Murder Club', '1', ['Mystery', 'Humor'], 2020, 11.9],
  ['The Man Who Died Twice', 'Richard Osman', 'Lesley Manville', 'Thursday Murder Club', '2', ['Mystery', 'Humor'], 2021, 11.6],
  ['The Bullet That Missed', 'Richard Osman', 'Lesley Manville', 'Thursday Murder Club', '3', ['Mystery', 'Humor'], 2022, 11.3],
  ['And Then There Were None', 'Agatha Christie', 'Dan Stevens', null, null, ['Mystery', 'Classics'], 1939, 6.0],
  ['Murder on the Orient Express', 'Agatha Christie', 'Dan Stevens', 'Hercule Poirot', '10', ['Mystery', 'Classics'], 1934, 6.6],
  ['Death on the Nile', 'Agatha Christie', 'Kenneth Branagh', 'Hercule Poirot', '17', ['Mystery', 'Classics'], 1937, 8.2],
  ['The Hound of the Baskervilles', 'Arthur Conan Doyle', 'Stephen Fry', 'Sherlock Holmes', '3', ['Mystery', 'Classics'], 1902, 6.5],
  ['Pride and Prejudice', 'Jane Austen', 'Rosamund Pike', null, null, ['Classics', 'Romance'], 1813, 11.6],
  ['Emma', 'Jane Austen', 'Emma Thompson', null, null, ['Classics', 'Romance'], 1815, 15.7],
  ['Jane Eyre', 'Charlotte Brontë', 'Thandiwe Newton', null, null, ['Classics', 'Romance'], 1847, 19.0],
  ['The Great Gatsby', 'F. Scott Fitzgerald', 'Jake Gyllenhaal', null, null, ['Classics', 'Fiction'], 1925, 4.8],
  ['East of Eden', 'John Steinbeck', 'Richard Poe', null, null, ['Classics', 'Fiction'], 1952, 25.6],
  ['Lessons in Chemistry', 'Bonnie Garmus', 'Miranda Raison', null, null, ['Fiction', 'Humor'], 2022, 11.9],
  ['Tomorrow, and Tomorrow, and Tomorrow', 'Gabrielle Zevin', 'Jennifer Kim', null, null, ['Fiction'], 2022, 13.2],
  ['A Gentleman in Moscow', 'Amor Towles', 'Nicholas Guy Smith', null, null, ['Fiction', 'Historical Fiction'], 2016, 17.9],
  ['The Lincoln Highway', 'Amor Towles', 'Marin Ireland', null, null, ['Fiction', 'Historical Fiction'], 2021, 16.6],
  ['Where the Crawdads Sing', 'Delia Owens', 'Cassandra Campbell', null, null, ['Fiction', 'Mystery'], 2018, 12.2],
  ['Remarkably Bright Creatures', 'Shelby Van Pelt', 'Marin Ireland', null, null, ['Fiction'], 2022, 11.8],
  ['Born a Crime', 'Trevor Noah', 'Trevor Noah', null, null, ['Memoir', 'Humor'], 2016, 8.8],
  ['Educated', 'Tara Westover', 'Julia Whelan', null, null, ['Memoir'], 2018, 12.1],
  ['Greenlights', 'Matthew McConaughey', 'Matthew McConaughey', null, null, ['Memoir'], 2020, 6.7],
  ['Sapiens', 'Yuval Noah Harari', 'Derek Perkins', null, null, ['History', 'Science'], 2011, 15.3],
  ['The Splendid and the Vile', 'Erik Larson', 'John Lee', null, null, ['History'], 2020, 18.5],
  ['The Devil in the White City', 'Erik Larson', 'Tony Goldwyn', null, null, ['History', 'True Crime'], 2003, 14.0],
  ['Killers of the Flower Moon', 'David Grann', 'Will Patton', null, null, ['History', 'True Crime'], 2017, 9.7],
  ['The Wager', 'David Grann', 'Dave Pittman', null, null, ['History', 'Adventure'], 2023, 8.8],
  ['Atomic Habits', 'James Clear', 'James Clear', null, null, ['Self-Help'], 2018, 5.6],
  ['Thinking, Fast and Slow', 'Daniel Kahneman', 'Patrick Egan', null, null, ['Science', 'Psychology'], 2011, 20.0],
  ['The Body', 'Bill Bryson', 'Bill Bryson', null, null, ['Science'], 2019, 15.3],
  ['A Short History of Nearly Everything', 'Bill Bryson', 'Richard Matthews', null, null, ['Science', 'History'], 2003, 17.8],
  ['The Code Breaker', 'Walter Isaacson', 'Kate Mulgrew', null, null, ['Science', 'Biography'], 2021, 16.3],
  ['Steve Jobs', 'Walter Isaacson', 'Dylan Baker', null, null, ['Biography'], 2011, 25.3],
  ['The Midnight Library', 'Matt Haig', 'Carey Mulligan', null, null, ['Fiction', 'Fantasy'], 2020, 8.8],
  ['Klara and the Sun', 'Kazuo Ishiguro', 'Sura Siu', null, null, ['Fiction', 'Science Fiction'], 2021, 10.2],
  ['Red Rising', 'Pierce Brown', 'Tim Gerard Reynolds', 'Red Rising', '1', ['Science Fiction'], 2014, 16.2],
  ['Golden Son', 'Pierce Brown', 'Tim Gerard Reynolds', 'Red Rising', '2', ['Science Fiction'], 2015, 18.5],
  ['Morning Star', 'Pierce Brown', 'Tim Gerard Reynolds', 'Red Rising', '3', ['Science Fiction'], 2016, 19.7],
  ['Fourth Wing', 'Rebecca Yarros', 'Rebecca Soler', 'The Empyrean', '1', ['Fantasy', 'Romance'], 2023, 20.6],
  ['Iron Flame', 'Rebecca Yarros', 'Rebecca Soler', 'The Empyrean', '2', ['Fantasy', 'Romance'], 2023, 24.1],
  ['A Court of Thorns and Roses', 'Sarah J. Maas', 'Jennifer Ikeda', 'A Court of Thorns and Roses', '1', ['Fantasy', 'Romance'], 2015, 16.4],
  ['A Court of Mist and Fury', 'Sarah J. Maas', 'Jennifer Ikeda', 'A Court of Thorns and Roses', '2', ['Fantasy', 'Romance'], 2016, 23.2],
  ['Beach Read', 'Emily Henry', 'Julia Whelan', null, null, ['Romance'], 2020, 10.6],
  ['Book Lovers', 'Emily Henry', 'Julia Whelan', null, null, ['Romance'], 2022, 11.2],
  ['Lonesome Dove', 'Larry McMurtry', 'Lee Horsley', null, null, ['Western', 'Classics'], 1985, 36.2],
  ['Shōgun', 'James Clavell', 'Ralph Lister', null, null, ['Historical Fiction', 'Classics'], 1975, 53.0],
  ['The Pillars of the Earth', 'Ken Follett', 'John Lee', null, null, ['Historical Fiction'], 1989, 40.9],
  ['11/22/63', 'Stephen King', 'Craig Wasson', null, null, ['Thriller', 'Science Fiction'], 2011, 30.7],
  ['The Stand', 'Stephen King', 'Grover Gardner', null, null, ['Horror', 'Fantasy'], 1978, 47.8],
  ['Holly', 'Stephen King', 'Justine Lupe', null, null, ['Thriller', 'Mystery'], 2023, 15.5],
]

const now = Date.parse('2026-10-10T18:00:00Z')
const created = ts(Date.parse('2023-12-01T00:00:00Z'))
const libraryId = uuid()
db.prepare(`INSERT INTO libraries (id, name, displayOrder, mediaType, createdAt, updatedAt) VALUES (?, 'Audiobooks', 1, 'book', ?, ?)`).run(libraryId, created, created)

interface DemoBook { id: string; title: string; author: string; narrators: string[]; series: string | null; seq: string | null; genres: string[]; year: number; duration: number }
const books: DemoBook[] = []
const authorIds = new Map<string, string>()
const seriesIds = new Map<string, string>()
const insBook = db.prepare(`INSERT INTO books (id, title, titleIgnorePrefix, publishedYear, duration, narrators, genres, tags, language, explicit, abridged, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, '[]', 'English', 0, 0, ?, ?)`)
const insItem = db.prepare(`INSERT INTO libraryItems (id, mediaId, mediaType, libraryId, title, path, relPath, isFile, isMissing, isInvalid, createdAt, updatedAt) VALUES (?, ?, 'book', ?, ?, ?, ?, 0, 0, 0, ?, ?)`)
for (const [title, author, narrator, series, seq, genres, year, hours] of CATALOG) {
  const id = uuid()
  const duration = Math.round(hours * 3600)
  insBook.run(id, title, title, String(year), duration, JSON.stringify([narrator]), JSON.stringify(genres), created, created)
  insItem.run(uuid(), id, libraryId, title, `/audiobooks/${author}/${title}`, `${author}/${title}`, created, created)
  if (!authorIds.has(author)) {
    const aid = uuid()
    authorIds.set(author, aid)
    db.prepare(`INSERT INTO authors (id, name, lastFirst, libraryId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`).run(aid, author, author, libraryId, created, created)
  }
  db.prepare(`INSERT INTO bookAuthors (id, bookId, authorId, createdAt) VALUES (?, ?, ?, ?)`).run(uuid(), id, authorIds.get(author)!, created)
  if (series) {
    if (!seriesIds.has(series)) {
      const sid = uuid()
      seriesIds.set(series, sid)
      db.prepare(`INSERT INTO series (id, name, nameIgnorePrefix, libraryId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`).run(sid, series, series, libraryId, created, created)
    }
    db.prepare(`INSERT INTO bookSeries (id, sequence, bookId, seriesId, createdAt) VALUES (?, ?, ?, ?, ?)`).run(uuid(), seq, id, seriesIds.get(series)!, created)
  }
  books.push({ id, title, author, narrators: [narrator], series, seq, genres, year, duration })
}

// A podcast for one family member
const podId = uuid()
db.prepare(`INSERT INTO podcasts (id, title, author, genres, numEpisodes, createdAt, updatedAt) VALUES (?, 'Hardcore History', 'Dan Carlin', '["History"]', 40, ?, ?)`).run(podId, created, created)
db.prepare(`INSERT INTO libraryItems (id, mediaId, mediaType, libraryId, title, isFile, isMissing, isInvalid, createdAt, updatedAt) VALUES (?, ?, 'podcast', ?, 'Hardcore History', 0, 0, 0, ?, ?)`).run(uuid(), podId, libraryId, created, created)
const episodes: string[] = []
for (let i = 0; i < 40; i++) {
  const eid = uuid()
  episodes.push(eid)
  db.prepare(`INSERT INTO podcastEpisodes (id, podcastId, "index", title, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`).run(eid, podId, i, `Episode ${i + 1}`, created, created)
}

// ------------------------------------------------------------ people
interface Profile {
  username: string
  type: string
  since: string
  /** probability of listening on a given weekday / weekend day */
  weekdayP: number
  weekendP: number
  /** mean minutes per active day */
  minutes: number
  /** [hour, weight] start-time preferences */
  hours: [number, number][]
  speed: number
  likes: string[]
  devices: [string, string][]
  podcasts?: boolean
  bingeChance: number
}
const PEOPLE: Profile[] = [
  { username: 'quill', type: 'root', since: '2024-01-03', weekdayP: 0.82, weekendP: 0.6, minutes: 70, hours: [[7, 5], [8, 3], [12, 2], [17, 4], [21, 3]], speed: 1.5, likes: ['Science Fiction', 'Fantasy', 'History', 'Science'], devices: [['Abs iOS', 'Apple iPhone 15 Pro'], ['Abs Web', 'macOS Safari']], podcasts: true, bingeChance: 0.15 },
  { username: 'maya', type: 'user', since: '2024-02-14', weekdayP: 0.7, weekendP: 0.8, minutes: 62, hours: [[21, 6], [22, 5], [23, 3], [13, 1]], speed: 1.25, likes: ['Romance', 'Fantasy', 'Mystery', 'Fiction', 'Memoir'], devices: [['Abs Android', 'Google Pixel 8']], bingeChance: 0.3 },
  { username: 'theo', type: 'user', since: '2024-06-01', weekdayP: 0.45, weekendP: 0.75, minutes: 55, hours: [[16, 4], [19, 5], [10, 3]], speed: 1.0, likes: ['Young Adult', 'Fantasy', 'Humor', 'LitRPG'], devices: [['Abs Android', 'Samsung Galaxy Tab A9'], ['Abs Web', 'Windows 11 Chrome']], bingeChance: 0.2 },
  { username: 'grandpa', type: 'user', since: '2024-09-15', weekdayP: 0.55, weekendP: 0.5, minutes: 70, hours: [[5, 4], [6, 5], [14, 2]], speed: 1.0, likes: ['History', 'Western', 'Classics', 'Mystery', 'Historical Fiction', 'Biography'], devices: [['Abs iOS', 'Apple iPad (10th gen)']], bingeChance: 0.05 },
]

const insUser = db.prepare(`INSERT INTO users (id, username, type, isActive, isLocked, permissions, bookmarks, extraData, createdAt, updatedAt) VALUES (?, ?, ?, 1, 0, '{}', '[]', '{}', ?, ?)`)
const insDevice = db.prepare(`INSERT INTO devices (id, deviceId, clientName, clientVersion, deviceName, userId, createdAt, updatedAt) VALUES (?, ?, ?, '0.9.80', ?, ?, ?, ?)`)
const insSession = db.prepare(`INSERT INTO playbackSessions (id, mediaItemId, mediaItemType, displayTitle, displayAuthor, duration, playMethod, mediaPlayer, startTime, currentTime, serverVersion, timeListening, mediaMetadata, date, dayOfWeek, extraData, userId, deviceId, libraryId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, 0, 'html5', ?, ?, '2.37.1', ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?)`)
const insProgress = db.prepare(`INSERT INTO mediaProgresses (id, mediaItemId, mediaItemType, duration, currentTime, isFinished, hideFromContinueListening, finishedAt, extraData, podcastId, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, 0, ?, '{}', ?, ?, ?, ?)`)

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

db.exec('BEGIN')
let totalSessions = 0
for (const p of PEOPLE) {
  const userId = uuid()
  insUser.run(userId, p.username, p.type, ts(Date.parse(p.since)), ts(now))
  const deviceIds = p.devices.map(([client, name]) => {
    const id = uuid()
    insDevice.run(id, uuid(), client, name, userId, ts(Date.parse(p.since)), ts(now))
    return id
  })

  // Reading order: books they like (series in order), shuffled by affinity.
  const scored = books
    .map((b) => ({ b, s: b.genres.filter((g) => p.likes.includes(g)).length + rand() * 1.2 }))
    .filter((x) => x.s > 1)
    .sort((a, b) => b.s - a.s)
  const queue: DemoBook[] = []
  for (const { b } of scored) {
    if (queue.includes(b)) continue
    if (!b.series) {
      queue.push(b)
      continue
    }
    // Pull in the whole series in order, though not always all of it.
    const run = books.filter((x) => x.series === b.series).sort((x, y) => Number(x.seq) - Number(y.seq))
    const take = rand() < 0.7 ? run.length : 1 + Math.floor(rand() * run.length)
    for (const sb of run.slice(0, take)) if (!queue.includes(sb)) queue.push(sb)
  }
  // Once favourites run out, branch out into the rest of the library.
  const rest = books.filter((b) => !queue.includes(b)).sort(() => rand() - 0.5)
  const unique = [...queue, ...rest]

  let current = 0
  let pos = 0 // seconds into the current book
  let epIdx = 0
  const progress = new Map<string, { cur: number; fin: number | null; dur: number; updated: number }>()
  const bingeUntil = { t: 0 }

  for (let day = Date.parse(p.since + 'T00:00:00Z'); day < now; day += 86_400_000) {
    const dow = new Date(day).getUTCDay()
    const weekend = dow === 0 || dow === 6
    const binge = day < bingeUntil.t
    if (rand() > (binge ? 0.97 : weekend ? p.weekendP : p.weekdayP)) continue
    if (rand() < p.bingeChance / 30) bingeUntil.t = day + (3 + rand() * 5) * 86_400_000
    // seasonal swing: more listening in winter and summer holidays
    const month = new Date(day).getUTCMonth()
    const season = 1 + 0.25 * Math.cos(((month - 0.5) / 12) * 2 * Math.PI) + (month === 6 || month === 7 ? 0.2 : 0)
    let minutes = Math.max(6, p.minutes * season * (binge ? 2.4 : 1) * (1 + 0.45 * gauss()))
    const nSessions = minutes > 90 ? 2 + Math.floor(rand() * 2) : 1 + Math.floor(rand() * 1.6)

    for (let s = 0; s < nSessions && current < unique.length; s++) {
      const total = p.hours.reduce((a, h) => a + h[1], 0)
      let r = rand() * total
      let hour = p.hours[0][0]
      for (const [h, w] of p.hours) if ((r -= w) <= 0) { hour = h; break }
      // hours are local (America/New_York-ish, UTC-4/-5), store as UTC
      const startMs = day + ((hour + 4 + s * 3) % 24) * 3_600_000 + Math.floor(rand() * 50) * 60_000
      const listen = Math.round((minutes / nSessions) * 60 * (0.6 + rand() * 0.8))
      const deviceId = pick(deviceIds)

      // Occasional podcast session instead of a book
      if (p.podcasts && rand() < 0.12) {
        const ep = episodes[epIdx++ % episodes.length]
        const epDur = 3 * 3600
        insSession.run(uuid(), ep, 'podcastEpisode', `Hardcore History Ep. ${epIdx}`, 'Dan Carlin', epDur, 0, listen * p.speed, listen, '{}', '', DAYS[dow], userId, deviceId, libraryId, ts(startMs), ts(startMs + listen * 1100))
        insProgress.run(uuid(), ep, 'podcastEpisode', epDur, Math.min(epDur, listen * p.speed), 0, null, podId, userId, ts(startMs), ts(startMs + listen * 1000))
        totalSessions++
        continue
      }

      const b = unique[current]
      const speed = p.speed * (0.95 + rand() * 0.1)
      const advance = Math.min(b.duration - pos, listen * speed)
      const actualListen = Math.round(advance / speed)
      const meta = JSON.stringify({ title: b.title, authors: [{ name: b.author }], narrators: b.narrators, series: b.series ? [{ name: b.series, sequence: b.seq }] : [], genres: b.genres, publishedYear: String(b.year) })
      insSession.run(uuid(), b.id, 'book', b.title, b.author, b.duration, pos, pos + advance, actualListen, meta, '', DAYS[dow], userId, deviceId, libraryId, ts(startMs), ts(startMs + actualListen * 1050))
      totalSessions++
      pos += advance

      const done = pos >= b.duration - 5
      progress.set(b.id, { cur: Math.min(pos, b.duration), fin: done ? startMs + actualListen * 1000 : null, dur: b.duration, updated: startMs + actualListen * 1000 })
      // Sometimes a book just doesn't grab them
      const abandon = !done && pos > b.duration * 0.15 && pos < b.duration * 0.6 && rand() < 0.012
      if (done || abandon) {
        current++
        pos = 0
      }
    }
  }
  for (const [mediaId, pr] of progress) {
    insProgress.run(uuid(), mediaId, 'book', pr.dur, pr.cur, pr.fin ? 1 : 0, pr.fin ? ts(pr.fin) : null, null, userId, ts(pr.updated), ts(pr.updated))
  }
  console.log(`  ${p.username.padEnd(8)} finished ${[...progress.values()].filter((x) => x.fin).length} books`)
}
db.exec('COMMIT')
db.close()
console.log(`Demo ABS database written to ${out} (${books.length} books, ${totalSessions} sessions)`)
