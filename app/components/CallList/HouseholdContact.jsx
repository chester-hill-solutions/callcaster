import React from "react";
import CallContact from "./CallContact/CallContact";

const HouseholdContact = ({ household, callsList, handleReplay, handlePause, handleCall, isPlaying, showUpdate, handleShowUpdate, questions, grouped }) => {
    
    return (
        <>
            {household.map((contact, index) => (
                <CallContact
                    key={contact.id}
                    contact={contact}
                    callsList={callsList}
                    handleReplay={handleReplay}
                    handlePause={handlePause}
                    handleCall={handleCall}
                    isPlaying={isPlaying}
                    showUpdate={showUpdate}
                    handleShowUpdate={handleShowUpdate}
                    questions={questions}
                    household={household}
                    firstInHouse={index === 0}
                    grouped={true}
                />
            ))}
        </>
    );
};

export default HouseholdContact;
