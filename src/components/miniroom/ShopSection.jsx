import React from 'react';
import { SHOP_CATEGORIES, SHOP_ITEMS } from '../../data/shop_items';
import SpriteItem from './SpriteItem';

const ShopSection = ({
    shopCategory,
    setShopCategory,
    buyItem,
    inventory,
    onPreview,
    currentTalants
}) => {
    return (
        <div className="bg-white rounded-[2rem] shadow-lg border border-slate-100 p-6 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center gap-4 mb-6 overflow-x-auto pb-2 scrollbar-hide">
                {SHOP_CATEGORIES.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => setShopCategory(cat.id)}
                        className={`px-5 py-2.5 rounded-2xl font-bold whitespace-nowrap transition-all ${shopCategory === cat.id ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                        {cat.icon} {cat.name}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {SHOP_ITEMS.filter(i => i.category === shopCategory).map(item => {
                    const isOwned = inventory.includes(item.id);
                    return (
                        <div key={item.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-3 flex flex-col items-center hover:shadow-md transition-shadow group relative">
                            <div
                                className="w-16 h-16 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform cursor-help overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-white"
                                onClick={() => onPreview(item)}
                                title="미리보기 (체험하기)"
                            >
                                {item.spriteSheet ? (
                                    <SpriteItem item={item} scale={0.8} />
                                ) : item.color || item.gradient || item.baseColor ? (
                                    <div
                                        className="w-full h-full"
                                        style={{
                                            backgroundColor: item.color || item.baseColor,
                                            backgroundImage: item.gradient
                                        }}
                                    />
                                ) : (
                                    <div className="text-3xl">{item.icon || '📦'}</div>
                                )}
                            </div>

                            <p className="text-[10px] font-bold text-slate-700 text-center leading-tight mb-auto w-full px-1">{item.name}</p>
                            <p className="text-[10px] font-black text-orange-500 mt-1">⭐ {item.price}</p>

                            {isOwned ? (
                                <div className="mt-2 w-full py-1.5 bg-slate-200 text-slate-400 rounded-lg text-[9px] font-black text-center">보유 중</div>
                            ) : (
                                <button
                                    onClick={() => buyItem(item)}
                                    className={`mt-2 w-full py-1.5 rounded-lg text-[9px] font-black transition-colors ${currentTalants >= item.price ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                                >
                                    구매하기
                                </button>
                            )}

                            <button
                                onClick={() => onPreview(item)}
                                className="absolute top-2 right-2 p-1 bg-white shadow-sm border border-slate-100 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-[8px]"
                                title="미리보기"
                            >
                                👁️
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ShopSection;
