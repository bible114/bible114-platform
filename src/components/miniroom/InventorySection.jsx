import React from 'react';
import { SHOP_ITEMS } from '../../data/shop_items';
import SpriteItem from './SpriteItem';

const InventorySection = ({
    inventory,
    onUseItem
}) => {
    return (
        <div className="bg-white rounded-[2rem] shadow-lg border border-slate-100 p-6 animate-in slide-in-from-bottom-4 duration-300">
            <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                📦 내가 가진 아이템 <span className="text-slate-300 text-sm">({inventory.length})</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {inventory.map((itemId, idx) => {
                    const item = SHOP_ITEMS.find(i => i.id === itemId);
                    if (!item) return null;
                    return (
                        <div key={`${itemId}_${idx}`} className="bg-slate-50 border border-slate-100 rounded-3xl p-4 flex flex-col items-center group">
                            <div className="w-20 h-20 flex items-center justify-center mb-3 overflow-hidden rounded-xl border border-slate-200 shadow-sm">
                                {item.spriteSheet ? (
                                    <SpriteItem item={item} scale={1.2} />
                                ) : item.color || item.gradient || item.baseColor ? (
                                    <div
                                        className="w-full h-full"
                                        style={{
                                            backgroundColor: item.color || item.baseColor,
                                            backgroundImage: item.gradient
                                        }}
                                    />
                                ) : (
                                    <div className="text-4xl">{item.icon || '📦'}</div>
                                )}
                            </div>

                            <p className="text-sm font-bold text-slate-700 text-center truncate w-full">{item.name}</p>
                            <button
                                onClick={() => onUseItem(item)}
                                className="mt-3 w-full py-2 bg-slate-200 text-slate-600 rounded-xl text-xs font-black hover:bg-indigo-100 hover:text-indigo-600 transition-colors"
                            >
                                {['wallpaper', 'floor', 'character', 'hair', 'accessory', 'outfit', 'eye', 'expression', 'hand'].includes(item.category) ? '착용/변경' : '배치하기'}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default InventorySection;
