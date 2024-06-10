import { useState, useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { ImportIcon, XIcon } from "lucide-react";
import 'tailwindcss/tailwind.css';

const TextInput = ({ name, value, onChange, className, label = name }) => (
    <div className={className}>
        <label htmlFor={name}>{label}</label>
        <input
            className="px-1 py-1.5"
            id={name}
            name={name}
            value={value}
            onChange={onChange}
        />
    </div>
);

const Dropdown = ({ name, value, onChange, options = [], className, label = name, disabled = false }) => (
    <div className={className}>
        <label htmlFor={name}>{label}</label>
        <select value={value} onChange={onChange} name={name} disabled={disabled} id={name} className="px-1 py-2 border-2 border-solid border-[var(--border)]">
            <option value={null}>Select a status</option>
            {options.map((opt) => (
                <option key={`${name}-${opt}`} value={opt}>{(opt[0].toUpperCase() + opt.substring(1)).replace('_', " ")}</option>
            ))}
        </select>
    </div>
)

const DateTime = ({ name, value = new Date(), onChange, label = name, className }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const initialSelectedDate = value ? new Date(value) : new Date();
    const [selectedDate, setSelectedDate] = useState(initialSelectedDate);
    const [selectedTime, setSelectedTime] = useState({
        hour: selectedDate?.getHours().toString().padStart(2, '0') || 0,
        minute: selectedDate?.getMinutes().toString().padStart(2, '0') || 0,
    });
    const [showCalendar, setShowCalendar] = useState(false);
    const calendarRef = useRef(null);
    //const setDateTime = 
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const getDaysInMonth = (month, year) => {
        return new Date(year, month + 1, 0).getDate();
    };

    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
    const daysInMonth = getDaysInMonth(currentDate.getMonth(), currentDate.getFullYear());

    const handlePrevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const handleDateClick = (day) => {
        const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        setSelectedDate(newDate);
        setShowCalendar(false);
        onChange && onChange(newDate);
    };

    const handleTimeChange = (e) => {
        const { name, value } = e.target;
        const newTime = { ...selectedTime, [name]: value.padStart(2, '0') };
        setSelectedTime(newTime);
        const newDate = new Date(selectedDate.setHours(newTime.hour, newTime.minute));
        console.log(newDate)
        onChange && onChange(newDate);
    };

    const handleClickOutside = (event) => {
        if (calendarRef.current && !calendarRef.current.contains(event.target)) {
            setShowCalendar(false);
        }
    };

    useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    return (
        <div className={className}>
            <label htmlFor={name} className="relative block">{label}</label>
            <input
                type="text"
                name={name}
                value={`${selectedDate.toLocaleDateString()} ${selectedTime.hour}:${selectedTime.minute}`}
                onClick={() => setShowCalendar(!showCalendar)}
                readOnly
                className="w-full p-2 mt-2 border rounded cursor-pointer z-0 relative"
            />
            {showCalendar && (
                <div style={{ zIndex: 10, minWidth: '364px' }} className="datetime-picker mt-2 absolute bg-white p-2 border-2 border-solid border-[var(--border)] " ref={calendarRef}>
                    <div className="calendar-header flex justify-between items-center mb-4">
                        <button onClick={handlePrevMonth} className="px-2 py-1 bg-gray-200 rounded">Prev</button>
                        <div className="text-lg font-semibold">
                            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                        </div>
                        <button onClick={handleNextMonth} className="px-2 py-1 bg-gray-200 rounded">Next</button>
                    </div>
                    <div className="calendar-grid grid grid-cols-7 gap-1" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                        {daysOfWeek.map(day => (
                            <div key={day} className="calendar-day-name text-center font-semibold">{day}</div>
                        ))}
                        {Array.from({ length: firstDayOfMonth }).map((_, index) => (
                            <div key={index} className="calendar-day empty"></div>
                        ))}
                        {Array.from({ length: daysInMonth }).map((_, index) => (
                            <div
                                key={index}
                                className={`calendar-day text-center p-2 cursor-pointer rounded`}
                                style={{
                                    background: index + 1 === selectedDate.getDate() ? 'hsl(var(--brand-primary))' : 'hsl(var(--brand-secondary))',
                                    color: index + 1 === selectedDate.getDate() ? 'white' : 'unset',
                                    borderRadius: '20px',
                                    height: "40px",
                                    width: "40px"
                                }}
                                onClick={() => handleDateClick(index + 1)}
                            >
                                {index + 1}
                            </div>
                        ))}
                    </div>
                    <div className="time-picker mt-4">
                        <label style={{ justifyContent: "flex-end" }} className="flex text-sm font-medium text-gray-700">Time</label>
                        <div className="flex mt-1"
                            style={{ justifyContent: "flex-end" }}>
                            <input
                                type="number"
                                name="hour"
                                value={selectedTime.hour}
                                onChange={handleTimeChange}
                                min="00"
                                max="23"
                                className="w-16 p-2 border rounded"
                            />
                            <span className="mx-2">:</span>
                            <input
                                type="number"
                                name="minute"
                                value={selectedTime.minute}
                                onChange={handleTimeChange}
                                min="00"
                                max="59"
                                className="w-16 p-2 border rounded"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const DragOver = ({
    handleDropContent,
    Icon,
    title,
    label,
    value,
    name
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [file, setFile] = useState(value);
    const fileInputRef = useRef(null);

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        setFile(droppedFile);
        handleDropContent(droppedFile);
    };

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        setFile(selectedFile);
        handleDropContent(selectedFile);
    };

    const handleRemoveFile = () => {
        setFile(null);
        handleDropContent(null);
    };

    const handleClick = () => {
        fileInputRef.current.click();
    };

    return (
        <div>
            <label htmlFor={name}>{label}</label>
            <div className="flex">
                <div
                    className={`py-2 px-4 ${isDragging ? 'bg-gray-200' : 'bg-brand-primary text-white'} rounded cursor-pointer`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={handleClick}
                >
                    <input
                        id={name}
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
                    />
                    <div className="flex items-center justify-center">
                        <span>{title}</span>
                        <span style={{ transform: "rotate(180deg)", marginLeft: "1rem", color: "white" }}><Icon /></span>
                    </div>
                </div>
                {file ? (
                    <div className="mt-2 flex items-center">
                        <button
                            onClick={handleRemoveFile}
                            className="text-red-500 hover:text-red-700 flex"
                        >
                            <XIcon /> Remove {file.name}
                        </button>
                    </div>
                ) : (
                    <div className="mt-2 text-gray-500">No file uploaded</div>
                )}</div>
        </div>
    );
};

const Toggle = ({ name, isChecked, onChange, label = name, leftLabel = '', rightLabel = '', className }) => {
    return (
        <div className={className}>
            <label htmlFor={name}>
                <div>{label}</div>
                <div className="flex gap-2" style={{alignItems:"baseline"}}>
                    <div className=" text-xl font-Zilla-Slab">{leftLabel}</div>
                    <div style={{ position: 'relative', zIndex: '5', height: "20px", width: "60px", borderRadius: '30px', backgroundColor: `${isChecked ? 'hsl(var(--secondary)' : '#333'}`, marginTop: "8px", transition: "background .3s ease",  }}>
                        <div style={{ position: "absolute", zIndex: "6", height: '24px', width: "24px", background: "hsl(var(--primary))", top: '-2px', transform: `translateX(${isChecked ? '40px' : '0px'})`, left: "-2px", transition: "transform .3s ease", borderRadius: "5px" }}>
                        </div>
                    </div>
                    <div className=" text-xl font-Zilla-Slab">{rightLabel}</div>
                </div>
            </label>
            <input type="checkbox" checked={isChecked} onChange={(e) => onChange(e.target.checked)} id={name} className="hidden" />
        </div>
    )
}

export { TextInput, Dropdown, DateTime, DragOver, Toggle };
