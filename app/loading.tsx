export default function Loading() {
    return (
      <main className="min-h-screen bg-gray-50">
        {/* 상단 배너 스켈레톤 */}
        <div className="bg-blue-600/50 p-6 rounded-b-[2rem] animate-pulse">
          <div className="h-4 w-20 bg-blue-400 rounded mb-2"></div>
          <div className="h-8 w-48 bg-blue-400 rounded mb-6"></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="h-20 bg-blue-400/50 rounded-xl"></div>
            <div className="h-20 bg-blue-400/50 rounded-xl"></div>
          </div>
        </div>
  
        {/* 메뉴 카드 스켈레톤 */}
        <div className="p-5 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center p-5 bg-white rounded-2xl shadow-sm border border-gray-100 animate-pulse">
              <div className="w-14 h-14 bg-gray-200 rounded-xl mr-4"></div>
              <div className="flex-1 space-y-2">
                <div className="h-5 w-24 bg-gray-200 rounded"></div>
                <div className="h-4 w-40 bg-gray-100 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </main>
    );
  }