import type { ReactNode } from 'react';
import type { AdminNavCategory } from '../tabs';
import type { AdminTab } from '../types';
import { AdminCategoryButtons, AdminTabButtons } from '../tabs';

interface AdminNavigationProps {
  activeCategory: AdminNavCategory;
  activeTab: AdminTab;
  activeTabLabel: string;
  adminCategories: AdminNavCategory[];
  setActiveTab: (tab: AdminTab) => void;
  activeTabDescriptionMap: Record<AdminTab, string>;
  children?: ReactNode;
}

export const AdminNavigation = ({
  activeCategory,
  activeTab,
  activeTabLabel,
  adminCategories,
  setActiveTab,
  activeTabDescriptionMap,
  children,
}: AdminNavigationProps) => {
  return (
    <>
      <section className="admin-v2-tab-nav">
        <AdminCategoryButtons
          categories={adminCategories}
          activeCategoryId={activeCategory.id}
          onSelectCategory={(categoryId) => {
            const category = adminCategories.find(
              (item) => item.id === categoryId,
            );
            if (category?.tabs[0]) {
              const savedTab = window.localStorage.getItem(
                `joj-admin-last-tab-${category.id}`,
              ) as AdminTab | null;
              const nextTab = category.tabs.some((tab) => tab.id === savedTab)
                ? savedTab!
                : category.tabs[0].id;
              setActiveTab(nextTab);
            }
          }}
        />
      </section>
      <section className="admin-v2-workspace">
        <header className={`admin-v2-workspace-head is-${activeCategory.id}`}>
          <div className="admin-v2-workspace-copy">
            <p className="admin-v2-kicker">{activeCategory.label}</p>
            <h3>{activeTabLabel}</h3>
            <p className="admin-v2-subtitle">
              {activeTabDescriptionMap[activeTab]}
            </p>
            <AdminTabButtons
              tabs={activeCategory.tabs}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              className={`admin-v2-tab-strip is-${activeCategory.id}`}
            />
          </div>
        </header>
        <div className="admin-v2-workspace-body">{children}</div>
      </section>
    </>
  );
};
