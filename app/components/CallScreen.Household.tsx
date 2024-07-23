import { CheckCircleIcon } from "lucide-react";

export const Household = ({ house, switchQuestionContact, attemptList, questionContact }) => {
  const isSelected = house?.find((contact) => contact?.id === questionContact?.id)
  return (
    <div
      style={{
        border: "3px solid #BCEBFF",
        borderRadius: "20px",
        //backgroundColor: "hsl(var(--card))",
        minHeight: "300px",
        alignItems: "stretch",
        flexDirection: "column",
        display: "flex",
        boxShadow: "3px 5px 0  rgba(50,50,50,.6)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTopLeftRadius: "18px",
          borderTopRightRadius: "18px",
          padding: "16px",
          background: "hsl(var(--brand-secondary))",
          width: "100%",
          textAlign: "center",
        }}
        className="font-Tabac-Slab text-xl dark:text-slate-800"
      >
        <div style={{ display: "flex", flex: "1", justifyContent: "center" }}>
          Household Members
        </div>
      </div>
      {house?.filter(Boolean).map((contact) => (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div
          key={contact.id}
          className={`flex justify-center p-2 m-1 rounded-2xl  ${isSelected?.id === contact?.id ? "bg-gray-100 border-primary border-2" : 'bg-secondary'} hover:shadow-inner-lg hover:opacity-85 hover:bg-gray-100 transition-all`}
          onClick={() => switchQuestionContact({ contact })}
        >
          <div className="flex flex-auto items-center justify-between font-semibold font-Zilla-Slab text-lg dark:text-slate-800">
            <div>
              {contact.contact.firstname} {contact.contact.surname}
            </div>
            <div>
              {attemptList.find(
                (attempt) => attempt.contact_id === contact.contact_id,
              )?.result.status && <CheckCircleIcon size={"16px"} />}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
