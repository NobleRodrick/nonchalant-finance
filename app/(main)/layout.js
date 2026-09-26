import React from "react";

export const dynamic = "force-dynamic";

const MainLayout = ({ children }) => {
  return (
    <div className="min-h-[calc(100vh-5rem)] pb-16 lg:pl-72 transition-all">
      <div className="px-3 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {children}
      </div>
    </div>
  );
};

export default MainLayout;
