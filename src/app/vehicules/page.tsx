import VehiclesPageContent from "@/components/VehiclesPageContent";

export default function VehiculesPage() {
  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Parc de véhicules</h1>
        <p className="text-gray-600 mt-1">Gérez vos véhicules et leur maintenance</p>
      </div>
      <VehiclesPageContent />
    </div>
  );
}
