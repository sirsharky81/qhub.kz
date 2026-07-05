import { CardSvg } from "@/components/games/CardSvg";
import type { PlayingCard } from "@/lib/games/cards/types";

function isSelected(selected: readonly string[], cardId: string): boolean {
  return selected.includes(cardId);
}

export function HeartsHand({
  cards,
  legalCardIds,
  selectedForPass,
  canPlay,
  onSelectPassCard,
  onPlayCard,
}: {
  cards: PlayingCard[];
  legalCardIds: Set<string>;
  selectedForPass: string[];
  canPlay: boolean;
  onSelectPassCard: (cardId: string) => void;
  onPlayCard: (cardId: string) => void;
}) {
  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Ваши карты</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {cards.map((card) => {
          const legal = legalCardIds.has(card.id);
          const selected = isSelected(selectedForPass, card.id);
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => (canPlay ? onPlayCard(card.id) : onSelectPassCard(card.id))}
              className={`rounded-lg transition ${
                selected
                  ? "ring-2 ring-amber-400 -translate-y-1"
                  : legal && canPlay
                    ? "ring-2 ring-emerald-400"
                    : ""
              }`}
            >
              <CardSvg card={card} className="w-16 h-auto" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
