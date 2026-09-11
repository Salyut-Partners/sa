import { describe, expect, it } from 'vitest';
import {
  decodeDataUrl, isFolderName, isPhotoRef, joinPhotos, mimeFor, sameProjectFile, splitPhotos,
} from './batch-folder.ts';
import { apply, createProject } from './project.ts';
import { fromFile, toFile, type ProjectFile } from './serialize.ts';
import type { Project } from './types.ts';

const JPEG = 'data:image/jpeg;base64,/9j/AAAA';
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function sample(): Project {
  return apply(createProject(), {
    type: 'photo/add',
    photos: [
      { id: 'a', name: 'airport.jpg', image: JPEG },
      { id: 'b', name: 'Фото 2 (копія).PNG', image: PNG },
    ],
  });
}

describe('isFolderName', () => {
  it('takes a folder name a shell and a URL leave alone', () => {
    expect(isFolderName('batch-1')).toBe(true);
    expect(isFolderName('seniors_nl.v2')).toBe(true);
  });

  it('refuses paths, spaces, capitals and hidden folders', () => {
    expect(isFolderName('../x')).toBe(false);
    expect(isFolderName('a/b')).toBe(false);
    expect(isFolderName('my batch')).toBe(false);
    expect(isFolderName('Batch')).toBe(false);
    expect(isFolderName('.hidden')).toBe(false);
    expect(isFolderName('')).toBe(false);
    expect(isFolderName(3)).toBe(false);
  });
});

describe('mimeFor', () => {
  it('reads a picture file back as the type it was written for', () => {
    expect(mimeFor('.jpg')).toBe('image/jpeg');
    expect(mimeFor('jpeg')).toBe('image/jpeg');
    expect(mimeFor('.PNG')).toBe('image/png');
    expect(mimeFor('.txt')).toBe('application/octet-stream');
  });
});

describe('decodeDataUrl', () => {
  it('splits a data URL into its type and its base64 payload', () => {
    expect(decodeDataUrl(JPEG)).toEqual({ mime: 'image/jpeg', base64: '/9j/AAAA' });
  });

  it('answers null for anything that is not a base64 data URL', () => {
    expect(decodeDataUrl('photos/a.jpg')).toBeNull();
    expect(decodeDataUrl('data:,plain')).toBeNull();
    expect(decodeDataUrl('')).toBeNull();
  });
});

describe('splitPhotos', () => {
  it('moves every picture out of the file and leaves a reference behind', () => {
    const { file, photos } = splitPhotos(toFile(sample()));
    expect(file.photos.map(p => p.image)).toEqual([
      `airport.jpg`,
      `Фото_2_копія.png`,
    ]);
    expect(photos).toEqual([
      { path: `airport.jpg`, mime: 'image/jpeg', base64: '/9j/AAAA' },
      { path: `Фото_2_копія.png`, mime: 'image/png', base64: 'iVBORw0KGgo=' },
    ]);
    expect(file.photos.every(p => isPhotoRef(p.image))).toBe(true);
  });

  it('does not touch the project it was given', () => {
    const before = toFile(sample());
    splitPhotos(before);
    expect(before.photos[0]!.image).toBe(JPEG);
  });

  it('names the file by the photo, whatever the original extension said', () => {
    // The bytes are what decide the extension: a .PNG holding a JPEG would be
    // written as a JPEG, and a name with no extension gets one.
    let p = apply(createProject(), {
      type: 'photo/add', photos: [{ id: 'a', name: 'shot', image: JPEG }],
    });
    p = apply(p, { type: 'photo/add', photos: [{ id: 'b', name: 'other.PNG', image: JPEG }] });
    const { photos } = splitPhotos(toFile(p));
    expect(photos.map(f => f.path)).toEqual([`shot.jpg`, `other.jpg`]);
  });

  it('keeps two photos with the same name apart, and shares a file when the bytes are the same', () => {
    const p = apply(createProject(), {
      type: 'photo/add',
      photos: [
        { id: 'a', name: 'x.jpg', image: JPEG },
        { id: 'b', name: 'x.jpg', image: 'data:image/jpeg;base64,/9j/BBBB' },
        { id: 'c', name: 'x.jpg', image: JPEG },
      ],
    });
    const { file, photos } = splitPhotos(toFile(p));
    expect(file.photos.map(f => f.image)).toEqual([
      `x.jpg`, `x-2.jpg`, `x.jpg`,
    ]);
    expect(photos.map(f => f.path)).toEqual([`x.jpg`, `x-2.jpg`]);
  });

  it('leaves a photo that already points at a file alone, with nothing to write for it', () => {
    const file = toFile(sample());
    file.photos[0]!.image = 'photos/kept.jpg';
    const split = splitPhotos(file);
    expect(split.file.photos[0]!.image).toBe('photos/kept.jpg');
    expect(split.photos.map(f => f.path)).toEqual([`Фото_2_копія.png`]);
  });
});

describe('joinPhotos', () => {
  const onDisk = (): { file: ProjectFile; bytes: Map<string, string> } => {
    const { file, photos } = splitPhotos(toFile(sample()));
    return { file, bytes: new Map(photos.map(p => [p.path, `data:${p.mime};base64,${p.base64}`])) };
  };

  it('puts the pictures back so the file opens exactly as it was saved', () => {
    const { file, bytes } = onDisk();
    const joined = joinPhotos(file, path => bytes.get(path) ?? null);
    expect(joined.missing).toEqual([]);
    const result = fromFile(joined.file);
    expect(result.ok).toBe(true);
    expect((result as { project: Project }).project.photos).toEqual(sample().photos);
  });

  it('opens without a photo whose file is gone, and says which one', () => {
    const { file, bytes } = onDisk();
    bytes.delete(`airport.jpg`);
    const joined = joinPhotos(file, path => bytes.get(path) ?? null);
    expect(joined.missing).toEqual([`airport.jpg`]);
    const result = fromFile(joined.file);
    expect(result.ok).toBe(true);
    expect((result as { project: Project }).project.photos.map(p => p.id)).toEqual(['b']);
  });

  it('opens the old format, whose pictures were inside the file, without asking the disk', () => {
    let asked = 0;
    const joined = joinPhotos(toFile(sample()), () => { asked++; return null; });
    expect(asked).toBe(0);
    expect(joined.missing).toEqual([]);
    expect(fromFile(joined.file).ok).toBe(true);
  });

  it('reads as the same batch after a round trip, whatever the picture called its type', () => {
    // `image/jpg` is not a registered type, but browsers hand it over; it is
    // written as .jpg and read back as image/jpeg, and that must not count as
    // an unsaved change.
    const project = apply(createProject(), {
      type: 'photo/add', photos: [{ id: 'a', name: 'a.jpg', image: 'data:image/jpg;base64,/9j/AAAA' }],
    });
    const { file, photos } = splitPhotos(toFile(project));
    const back = joinPhotos(file, path => {
      const found = photos.find(p => p.path === path);
      return found === undefined ? null : `data:${mimeFor(path.split('.').pop()!)};base64,${found.base64}`;
    });
    expect(sameProjectFile(toFile(project), back.file)).toBe(true);
    const edited = apply(project, { type: 'project/patch', patch: { duration: 12 } });
    expect(sameProjectFile(toFile(edited), back.file)).toBe(false);
  });

  it('hands anything that is not a project through untouched, for fromFile to refuse', () => {
    expect(joinPhotos({ hello: 'world' }, () => null)).toEqual({ file: { hello: 'world' }, missing: [] });
    expect(joinPhotos(null, () => null).missing).toEqual([]);
  });
});
