#!/usr/bin/env python3
"""Read-only bridge for export-nt-sword-staging.mjs. JSON is emitted only to stdout."""
import argparse
import json
import sys

from pysword.modules import SwordModules


BOOKS = {
    'Matthew': ('matthew', '마태복음'), 'Mark': ('mark', '마가복음'),
    'Luke': ('luke', '누가복음'), 'John': ('john', '요한복음'),
    'Acts': ('acts', '사도행전'), 'Romans': ('romans', '로마서'),
    'I Corinthians': ('1corinthians', '고린도전서'),
    'II Corinthians': ('2corinthians', '고린도후서'),
    'Galatians': ('galatians', '갈라디아서'), 'Ephesians': ('ephesians', '에베소서'),
    'Philippians': ('philippians', '빌립보서'), 'Colossians': ('colossians', '골로새서'),
    'I Thessalonians': ('1thessalonians', '데살로니가전서'),
    'II Thessalonians': ('2thessalonians', '데살로니가후서'),
    'I Timothy': ('1timothy', '디모데전서'), 'II Timothy': ('2timothy', '디모데후서'),
    'Titus': ('titus', '디도서'), 'Philemon': ('philemon', '빌레몬서'),
    'Hebrews': ('hebrews', '히브리서'), 'James': ('james', '야고보서'),
    'I Peter': ('1peter', '베드로전서'), 'II Peter': ('2peter', '베드로후서'),
    'I John': ('1john', '요한일서'), 'II John': ('2john', '요한이서'),
    'III John': ('3john', '요한삼서'), 'Jude': ('jude', '유다서'),
    'Revelation of John': ('revelation', '요한계시록'),
}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sword-path', required=True)
    parser.add_argument('--module', action='append', required=True)
    return parser.parse_args()


def main():
    args = parse_args()
    requested = []
    for value in args.module:
        if '=' not in value:
            raise ValueError('--module must be PLAN_ID=MODULE_ID')
        requested.append(value.split('=', 1))
    modules = SwordModules(args.sword_path)
    modules.parse_modules()
    result = {}
    for plan_id, module_id in requested:
        bible = modules.get_bible_from_module(module_id)
        structure = bible.get_structure()
        records = []
        for book in structure._books['nt']:
            if book.name not in BOOKS:
                raise ValueError(f'unknown NT book: {book.name}')
            slug, label = BOOKS[book.name]
            for chapter, verse_count in enumerate(book.chapter_lengths, 1):
                for verse in range(1, verse_count + 1):
                    text = bible.get(books=[book.name], chapters=[chapter], verses=[verse])
                    text = (text or '').strip().replace('\r\n', '\n').replace('\r', '\n')
                    record = {
                        'bookSlug': slug,
                        'bookLabel': label,
                        'chapter': chapter,
                        'verse': verse,
                    }
                    if text:
                        record['segments'] = [{
                            'kind': 'text', 'text': text,
                            'paragraphStart': True, 'joinBefore': '',
                        }]
                    else:
                        record['segments'] = []
                        record['omitted'] = True
                    records.append(record)
        result[plan_id] = records
    json.dump(result, sys.stdout, ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
    main()
