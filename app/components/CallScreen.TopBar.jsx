const TopBar = ({ handleQueueButton, state, handleNextNumber, handleDialNext }) => (
    <div className="flex p-4 gap-2" style={{ border: '3px solid #BCEBFF', borderRadius: "20px", marginBottom: "2rem" }}>
        <button onClick={handleQueueButton} style={{ padding: "8px 16px", background: "#d60000", borderRadius: "5px", color: 'white' }}>
            {state === 'idle' ? 'Load' : 'Loading'}
        </button>
        <div className="flex row gap2" style={{ display: 'flex', gap: "8px" }}>
            <button disabled style={{ padding: "8px 16px", background: "#d60000", borderRadius: "5px", color: 'white', opacity: ".5" }}>
                Predictive Dial
            </button>
            <button onClick={handleDialNext} style={{ padding: "8px 16px", border: "1px solid #d60000", borderRadius: "5px" }}>
                Dial Next
            </button>
        </div>
        <div className="flex row gap2" style={{ display: 'flex', gap: "8px" }}>
            <button onClick={() => handleNextNumber(true)} style={{ padding: "8px 16px", background: "#d60000", borderRadius: "5px", color: 'white' }}>
                Skip Household
            </button>
            <button onClick={() => handleNextNumber(false)} style={{ padding: "8px 16px", border: "1px solid #d60000", borderRadius: "5px" }}>
                Skip Person
            </button>
        </div>
    </div>
)

export { TopBar }