import { CheckCircleIcon } from "lucide-react";

export const Household = ({ house, switchQuestionContact, attemptList }) => {
  return (
    <div
      style={{
        border: "3px solid #BCEBFF",
        borderRadius: "20px",
        marginBottom: "2rem",
        backgroundColor: "hsl(var(--card))",
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
        className="font-Tabac-Slab text-xl"
      >
        <div style={{ display: "flex", flex: "1", justifyContent: "center" }}>
          Household Members
        </div>
      </div>
      {house?.map((contact) => (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div
          key={contact.id}
          className="flex justify-center p-2 hover:bg-white"
          onClick={() => switchQuestionContact({ contact })}
        >
          <div className="flex flex-auto items-center justify-between">
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
